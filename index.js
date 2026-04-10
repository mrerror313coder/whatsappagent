const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const pino = require('pino');

// 🌟 SECURE FIREBASE URL FROM GITHUB SECRETS 🌟
const FIREBASE_URL = process.env.FIREBASE_URL;

const orderStates = {}; 

// Function to fetch the dynamic tools list from your App's Firebase
async function getToolsList() {
    try {
        const response = await fetch(`${FIREBASE_URL}/tools.json`);
        const data = await response.json();
        if (!data) return [];
        
        // Convert Firebase object into an array
        return Object.keys(data).map(key => ({
            id: key,
            name: data[key].name,
            price: data[key].price,
            imageUrl: data[key].imageUrl
        }));
    } catch (error) {
        console.error("Failed to fetch tools list:", error);
        return [];
    }
}

async function startBot() {
    if (!FIREBASE_URL) {
        console.log("❌ ERROR: FIREBASE_URL is missing in GitHub Secrets!");
        process.exit(1);
    }

    const { state, saveCreds } = await useMultiFileAuthState('session_data');
    const { version } = await fetchLatestBaileysVersion();

    // ⚠️ YAHAN APNA BOT WALA WHATSAPP NUMBER LIKHEIN
    const phoneNumber = "923059108301"; 

    const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false, 
        logger: pino({ level: 'silent' }),
        browser: ["Ubuntu", "Chrome", "20.0.04"] 
    });

    // --- 🌟 PAIRING CODE LOGIC 🌟 ---
    if (!sock.authState.creds.registered) {
        setTimeout(async () => {
            try {
                let code = await sock.requestPairingCode(phoneNumber);
                code = code?.match(/.{1,4}/g)?.join("-") || code;
                console.log('\n==================================================');
                console.log(`🔑 AAPKA PAIRING CODE: ${code}`);
                console.log('Yeh code apne WhatsApp mein (Link with phone number instead) mein daalein!');
                console.log('==================================================\n');
            } catch (error) {
                console.error("Pairing Code Error: ", error);
            }
        }, 3000);
    }

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === 'open') console.log('✅ SEO TOOLS AI IS ONLINE!');
        if (connection === 'close') {
            const reason = lastDisconnect?.error?.output?.statusCode;
            if (reason !== DisconnectReason.loggedOut) startBot();
        }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.remoteJid === 'status@broadcast') return;
        if (msg.key.fromMe) return; 

        const sender = msg.key.remoteJid;
        const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || "").toLowerCase();

        console.log(`📩 Query: ${text}`);

        // --- 🛒 STEP 2: FINISH ORDER & SEND TO ADMIN PANEL ---
        if (orderStates[sender]?.step === 'WAITING_FOR_DETAILS') {
            const customerDetails = text; 
            const item = orderStates[sender].item;
            const customerWaNumber = sender.split('@')[0];

            const seoOrder = {
                userId: "whatsapp_" + customerWaNumber,
                phone: customerWaNumber, 
                details: customerDetails, 
                items: [{
                    id: item.id,
                    name: item.name,
                    price: parseFloat(item.price),
                    img: item.imageUrl || "",
                    quantity: 1
                }],
                total: parseFloat(item.price).toFixed(2), 
                status: "Pending Setup",
                method: "Invoice via WhatsApp",
                timestamp: new Date().toISOString()
            };

            try {
                await fetch(`${FIREBASE_URL}/orders.json`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(seoOrder)
                });
            } catch (error) {
                console.log("Firebase Error: ", error);
            }

            // ✅ YAHAN $ KO RS KIYA GAYA HAI
            await sock.sendMessage(sender, { text: `✅ *Subscription Request Received!* \n\nThank you! Your access to *${item.name}* is being generated. \n\n*Total:* Rs. ${seoOrder.total}/month\n*Status:* Awaiting Payment\n\nOur admin will contact you shortly with the payment gateway link and your login credentials.` });
            delete orderStates[sender]; 
            return;
        }

        // --- 🌟 STEP 1: START ORDER FLOW ---
        if (text.startsWith("order ")) {
            const productRequested = text.replace("order ", "").trim().toLowerCase();
            const currentTools = await getToolsList();
            
            const matchedItem = currentTools.find(item => item.name.toLowerCase().includes(productRequested));

            if (!matchedItem) {
                await sock.sendMessage(sender, { text: `❌ Sorry, we couldn't find *${productRequested}* in our tools list right now.\n\nType *tools* to see all available services.` });
                return;
            }

            orderStates[sender] = { step: 'WAITING_FOR_DETAILS', item: matchedItem };
            
            // ✅ YAHAN $ KO RS KIYA GAYA HAI
            const captionText = `🚀 *Setup Started!* \n\nYou selected: *${matchedItem.name}* (Rs. ${matchedItem.price}/mo)\n\nPlease reply with your *Full Name, Email Address, and Website URL* to create your account.`;
            
            if (matchedItem.imageUrl) {
                await sock.sendMessage(sender, { 
                    image: { url: matchedItem.imageUrl }, 
                    caption: captionText 
                });
            } else {
                await sock.sendMessage(sender, { text: captionText });
            }
        }
        else if (text === "order") { 
            await sock.sendMessage(sender, { text: "🛒 *How to subscribe:* \nPlease type 'order' followed by the tool name. \nExample: *order semrush pro*" });
        }
        
        // --- DYNAMIC TOOLS LIST FEATURE ---
        else if (text.includes("tools") || text.includes("price") || text.includes("list") || text.includes("services")) {
            const currentTools = await getToolsList();
            
            if (currentTools.length === 0) {
                await sock.sendMessage(sender, { text: "Our tools database is currently updating. Please check back soon!" });
                return;
            }

            let menuMessage = "📈 *PREMIUM SEO TOOLS PRICING* 🚀\n\n";
            currentTools.forEach(item => {
                // ✅ YAHAN BHI $ KO RS KIYA GAYA HAI
                menuMessage += `🔸 *${item.name}* - Rs. ${item.price}/mo\n`;
            });
            menuMessage += "\n_To subscribe, reply with 'order [tool name]'_";
            
            await sock.sendMessage(sender, { text: menuMessage });
        }

        // --- GREETINGS ---
        else if (text.includes("hi") || text.includes("hello") || text.includes("hey")) {
            await sock.sendMessage(sender, { text: "👋 *Welcome to RankBoost SEO!* \n\nI am your automated AI assistant. Type *tools* to see our premium SEO toolset, or type *order [tool]* to buy instantly!" });
        }
        else if (text.includes("contact") || text.includes("call") || text.includes("support")) {
            await sock.sendMessage(sender, { text: "📞 *Contact Support:* \n\n- *Email:* support@rankboostseo.com\n- *Admin:* +1 (555) 019-2834" });
        }
        else {
            await sock.sendMessage(sender, { text: "🤔 I didn't quite catch that.\n\nType *tools* to see our available software list, or *order [tool]* to purchase access!" });
        }
    });
}

startBot().catch(err => console.log("Error: " + err));

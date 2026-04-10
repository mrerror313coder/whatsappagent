const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
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

    const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: 'silent' }),
        browser: ["SEO", "Tools", "1"] 
    });

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            console.clear(); 
            console.log('\n==================================================');
            console.log('⚠️ QR CODE TOO BIG? CLICK "View raw logs" in top right!');
            console.log('==================================================\n');
            qrcode.generate(qr, { small: true }); 
        }

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
        if (msg.key.fromMe) return; // Loop Protection

        const sender = msg.key.remoteJid;
        const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || "").toLowerCase();

        console.log(`📩 Query: ${text}`);

        // --- 🛒 STEP 2: FINISH ORDER & SEND TO ADMIN PANEL ---
        if (orderStates[sender]?.step === 'WAITING_FOR_DETAILS') {
            const customerDetails = text; // Now expects Name, Email, and Website
            const item = orderStates[sender].item;
            const customerWaNumber = sender.split('@')[0];

            // Match the exact format of your Admin Panel
            const seoOrder = {
                userId: "whatsapp_" + customerWaNumber,
                phone: customerWaNumber, 
                details: customerDetails, // Saves Name, Email, and Website URL typed by them
                items: [{
                    id: item.id,
                    name: item.name,
                    price: parseFloat(item.price),
                    img: item.imageUrl || "",
                    quantity: 1
                }],
                total: parseFloat(item.price).toFixed(2), // Flat price for digital goods
                status: "Pending Setup",
                method: "Invoice via WhatsApp",
                timestamp: new Date().toISOString()
            };

            // Save order securely via REST API
            try {
                await fetch(`${FIREBASE_URL}/orders.json`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(seoOrder)
                });
            } catch (error) {
                console.log("Firebase Error: ", error);
            }

            await sock.sendMessage(sender, { text: `✅ *Subscription Request Received!* \n\nThank you! Your access to *${item.name}* is being generated. \n\n*Total:* $${seoOrder.total}/month\n*Status:* Awaiting Payment\n\nOur admin will contact you shortly with the payment gateway link and your login credentials.` });
            delete orderStates[sender]; 
            return;
        }

        // --- 🌟 STEP 1: START ORDER FLOW (WITH IMAGE & DETAILS REQUEST) ---
        if (text.startsWith("order ")) {
            const productRequested = text.replace("order ", "").trim().toLowerCase();
            const currentTools = await getToolsList();
            
            // Search the live database for the requested tool
            const matchedItem = currentTools.find(item => item.name.toLowerCase().includes(productRequested));

            if (!matchedItem) {
                await sock.sendMessage(sender, { text: `❌ Sorry, we couldn't find *${productRequested}* in our tools list right now.\n\nType *tools* to see all available services.` });
                return;
            }

            orderStates[sender] = { step: 'WAITING_FOR_DETAILS', item: matchedItem };
            
            // 🌟 REQUEST DIGITAL SETUP DETAILS 🌟
            const captionText = `🚀 *Setup Started!* \n\nYou selected: *${matchedItem.name}* ($${matchedItem.price}/mo)\n\nPlease reply with your *Full Name, Email Address, and Website URL* to create your account.`;
            
            // If the product has an image URL in Firebase, send it as a WhatsApp Photo
            if (matchedItem.imageUrl) {
                await sock.sendMessage(sender, { 
                    image: { url: matchedItem.imageUrl }, 
                    caption: captionText 
                });
            } else {
                // Fallback if no image is found
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
                menuMessage += `🔸 *${item.name}* - $${item.price}/mo\n`;
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

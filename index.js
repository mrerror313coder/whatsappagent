const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, delay } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal'); 
const pino = require('pino');

// 🌟 SECURE FIREBASE URL FROM GITHUB SECRETS 🌟
const FIREBASE_URL = process.env.FIREBASE_URL;

// ⚠️ APNI DETAILS YAHAN LIKHEIN
const BOT_NUMBER = "923059108301"; // Aapka bot wala number
const OWNER_NUMBER = "923058008888"; // Aapka apna personal admin number
const OWNER_NAME = "RankBoostSEO Admin";

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
        browser: ["RankBoostSEO", "Tools", "1"],
        markOnlineOnConnect: true // Show bot as "Online"
    });

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        // --- 🌟 QR CODE LOGIC 🌟 ---
        if (qr) {
            console.clear(); 
            console.log('\n==================================================');
            console.log('⚠️ QR CODE SCAN KAREIN YA GITHUB RAW LOGS DEKHEIN!');
            console.log('==================================================\n');
            qrcode.generate(qr, { small: true }); 
        }

        if (connection === 'open') console.log('✅ RANKBOOST AI BOT IS ONLINE!');
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

        // 🌟 EXTRA FEATURE 1: Auto Read (Blue Ticks) & Typing Indicator
        await sock.readMessages([msg.key]); 
        await sock.sendPresenceUpdate('composing', sender); 
        await delay(1000); // Thoda human-like delay
        await sock.sendPresenceUpdate('paused', sender);

        // 🌟 EXTRA FEATURE 2: Order Cancel Option
        if (text === 'cancel' && orderStates[sender]) {
            delete orderStates[sender];
            await sock.sendMessage(sender, { text: "🚫 *Process Cancelled.*\n\nAapka order process rok diya gaya hai. Menu dekhne ke liye *tools* type karein." });
            return;
        }

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

            await sock.sendMessage(sender, { text: `✅ *Subscription Request Received!*\n\nThank you! Your access to *${item.name}* is being generated. \n\n💳 *Total Amount:* Rs. ${seoOrder.total}/month\n⏳ *Status:* Awaiting Payment\n\nOur admin will contact you shortly with the payment gateway link and your login credentials.\n\n_Type *menu* to see other tools._` });
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
            
            const captionText = `🚀 *Setup Started!*\n\n🔹 *Selected Tool:* ${matchedItem.name}\n💰 *Price:* Rs. ${matchedItem.price}/mo\n\n📝 *Please reply with your:*\n1. Full Name\n2. Email Address\n3. Website URL\n\n_(Type *cancel* to stop this process)_`;
            
            if (matchedItem.imageUrl) {
                await sock.sendMessage(sender, { 
                    image: { url: matchedItem.imageUrl }, 
                    caption: captionText 
                });
            } else {
                await sock.sendMessage(sender, { text: captionText });
            }
        }
        
        // 🌟 EXTRA FEATURE 3: Ping / Speed Test
        else if (text === "!ping" || text === "ping") {
            const start = Date.now();
            await sock.sendMessage(sender, { text: "Pong! 🏓" });
            const end = Date.now();
            await sock.sendMessage(sender, { text: `⚡ Bot Speed: *${end - start}ms*` });
        }

        // 🌟 EXTRA FEATURE 4: Owner/Admin Info
        else if (text === "!admin" || text === "admin" || text === "owner") {
            const vcard = 'BEGIN:VCARD\n' 
            + 'VERSION:3.0\n' 
            + `FN:${OWNER_NAME}\n` 
            + `TEL;type=CELL;type=VOICE;waid=${OWNER_NUMBER}:+${OWNER_NUMBER}\n` 
            + 'END:VCARD';

            await sock.sendMessage(sender, { 
                contacts: { 
                    displayName: OWNER_NAME, 
                    contacts: [{ vcard }] 
                }
            });
            await sock.sendMessage(sender, { text: "👨‍💻 *This is the Admin of RankBoostSEO.*\nPlease contact for custom SEO solutions or payment verifications." });
        }

        else if (text === "order") { 
            await sock.sendMessage(sender, { text: "🛒 *How to subscribe:* \nPlease type 'order' followed by the tool name. \nExample: *order semrush pro*" });
        }
        
        // --- DYNAMIC TOOLS LIST FEATURE ---
        else if (text.includes("tools") || text.includes("price") || text.includes("list") || text.includes("services") || text === "menu") {
            const currentTools = await getToolsList();
            
            if (currentTools.length === 0) {
                await sock.sendMessage(sender, { text: "Our tools database is currently updating. Please check back soon!" });
                return;
            }

            let menuMessage = "╭━━━〔 *RankBoost SEO Tools* 〕━━━\n┃\n";
            currentTools.forEach((item, index) => {
                menuMessage += `┣ 🔸 *${index + 1}. ${item.name}*\n┣ 💰 Price: Rs. ${item.price}/mo\n┃\n`;
            });
            menuMessage += "╰━━━━━━━━━━━━━━━━━━━━━━\n\n📌 _To subscribe, reply with:_ \n👉 *order [tool name]*\n_Example: order ahrefs_";
            
            await sock.sendMessage(sender, { text: menuMessage });
        }

        // --- GREETINGS ---
        else if (text === "hi" || text === "hello" || text === "hey" || text === "assalamualaikum" || text === "salam") {
            await sock.sendMessage(sender, { text: "👋 *Welcome to RankBoost SEO!*\n\nI am your automated AI assistant 🤖.\n\nHere is what I can do:\n🔍 Type *tools* - To see our premium SEO tools.\n🛒 Type *order [tool name]* - To buy instantly.\n👨‍💻 Type *!admin* - To contact the owner.\n🏓 Type *!ping* - To check bot speed." });
        }
        else if (text.includes("contact") || text.includes("call") || text.includes("support")) {
            await sock.sendMessage(sender, { text: "📞 *Contact Support:* \n\n- *Email:* mrerror313@duck.com\n- *Admin:* +923058008888\n\nOr type *!admin* to get WhatsApp contact." });
        }
        else {
            // Default fallback (Removed annoying repeated replies for every single word)
            if(text.length > 3) {
                 await sock.sendMessage(sender, { text: "🤔 I didn't quite catch that.\n\nType *tools* to see our available software list, or type *hi* for the main menu." });
            }
        }
    });
}

startBot().catch(err => console.log("Error: " + err));

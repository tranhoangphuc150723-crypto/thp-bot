const { Zalo } = require("zca-js");
const express = require("express");
const fs = require("fs");

// Tạo web server duy trì 24/7 trên Render
const app = express();
const PORT = process.env.PORT || 3000;
app.get("/", (req, res) => res.send("THP Bot is running 24/7!"));
app.listen(PORT, () => console.log(`Web server running on port ${PORT}`));

// Database lưu trữ dữ liệu
const DB_FILE = "database.json";
let db = { users: {}, teams: {}, rentals: {}, settings: {} };
if (fs.existsSync(DB_FILE)) {
    try { db = JSON.parse(fs.readFileSync(DB_FILE)); } catch (e) { }
}
function saveDB() {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

const ADMIN_PHONE = "0344262218";

async function startBot() {
    try {
        console.log("Đang khởi tạo Zalo Bot...");
        // Cấu hình để in QR code trực tiếp ra log console dạng terminal
        const zalo = new Zalo({
            printQR: true
        });

        zalo.listener.on("message", async (api, message) => {
            const senderId = message.senderId;
            const text = message.text ? message.text.trim() : "";
            const threadId = message.threadId;

            if (!text.startsWith("!")) return;

            const args = text.slice(1).split(" ");
            const cmd = args[0].toLowerCase();

            if (cmd === "luotdung" || cmd === "turn") {
                if (!db.users[senderId]) db.users[senderId] = { turns: 5 };
                await api.sendMessage(`Bạn còn lại ${db.users[senderId].turns} lượt sử dụng.`, threadId);
            }
            else if (cmd === "cpr") {
                const val = parseFloat(args[1]);
                if (isNaN(val)) {
                    await api.sendMessage("Cú pháp: !cpr <số_liệu>", threadId);
                } else {
                    const result = val * 1.25;
                    await api.sendMessage(`Kết quả CPR: ${result}`, threadId);
                }
            }
            else if (cmd === "team") {
                const action = args[1];
                const teamName = args[2];
                if (action === "tao" && teamName) {
                    db.teams[teamName] = { leader: senderId, members: [senderId] };
                    saveDB();
                    await api.sendMessage(`Đã tạo team [${teamName}] thành công!`, threadId);
                } else {
                    await api.sendMessage("Cú pháp: !team tao <tên_team>", threadId);
                }
            }
            else if (cmd === "thue") {
                const item = args[1] || "phòng chung";
                db.rentals[senderId] = { item, time: Date.now() };
                saveDB();
                await api.sendMessage(`Đã ghi nhận thuê: ${item}`, threadId);
            }
            else if (cmd === "admin") {
                await api.sendMessage(`Xin chào Admin ${ADMIN_PHONE}. Hệ thống hoạt động tốt!`, threadId);
            }
        });

        console.log("Bot đã sẵn sàng kết nối!");
    } catch (error) {
        console.error("Lỗi khởi động bot:", error);
    }
}

startBot();

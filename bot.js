/**
 * THP BOT - MAIN SCRIPT (COMPLETE VERSION WITH EXPRESS SERVER FOR RENDER 24/7)
 */
const fs = require('fs');
const path = require('path');
const login = require('fca-unofficial');
const express = require('express');

// Tạo web server đơn giản để Render không bị tắt bot (ngủ đông)
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('THP Bot is running 24/7!');
});

app.listen(PORT, () => {
    console.log(`Web server đang chạy trên cổng ${PORT}`);
});

const dbFile = './database.json';

function loadDatabase() {
    if (fs.existsSync(dbFile)) {
        try {
            const data = JSON.parse(fs.readFileSync(dbFile, 'utf8'));
            return {
                userRemainingTurns: data.userRemainingTurns || {},
                groupTeamProfiles: data.groupTeamProfiles || {},
                groupRentalExpiry: data.groupRentalExpiry || {},
                antiSettings: data.antiSettings || {},
                teams: data.teams || {}
            };
        } catch (e) {
            console.error("Lỗi đọc database:", e);
        }
    }
    return { userRemainingTurns: {}, groupTeamProfiles: {}, groupRentalExpiry: {}, antiSettings: {}, teams: {} };
}

let db = loadDatabase();
let userRemainingTurns = db.userRemainingTurns;
let groupTeamProfiles = db.groupTeamProfiles;
let groupRentalExpiry = db.groupRentalExpiry;
let antiSettings = db.antiSettings;
let teams = db.teams;

function saveDatabase() {
    const data = { userRemainingTurns, groupTeamProfiles, groupRentalExpiry, antiSettings, teams };
    fs.writeFileSync(dbFile, JSON.stringify(data, null, 2));
}

const ADMIN_ID = "0344262218";

function getAndDecreaseTurn(threadId, senderId = null) {
    if (senderId === ADMIN_ID) {
        return `Vĩnh viễn (Chủ bot)`;
    }
    const personalKey = `${threadId}_${senderId}`;
    if (userRemainingTurns[personalKey] === undefined) {
        userRemainingTurns[personalKey] = 100;
    }
    if (userRemainingTurns[personalKey] > 0) {
        userRemainingTurns[personalKey] -= 1;
    }
    saveDatabase();
    return `${userRemainingTurns[personalKey]} lượt sử dụng`;
}

function calculateRental(currentExpiry, addDays = null, isVohan = false) {
    const now = new Date();
    let expiryDate;

    if (isVohan) {
        return {
            timeLeftStr: "Vĩnh viễn",
            expiryDateStr: "Vĩnh viễn"
        };
    }

    if (addDays) {
        let baseDate = (currentExpiry && new Date(currentExpiry) > now) ? new Date(currentExpiry) : now;
        expiryDate = new Date(baseDate.getTime());
        expiryDate.setDate(expiryDate.getDate() + addDays);
    } else {
        if (!currentExpiry) {
            return { timeLeftStr: "Chưa thuê bot", expiryDateStr: "Chưa rõ" };
        }
        expiryDate = new Date(currentExpiry);
    }

    const diffTime = expiryDate - now;
    if (diffTime <= 0) {
        return { timeLeftStr: "Đã hết hạn", expiryDateStr: expiryDate.toISOString().split('T')[0] };
    }

    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor((diffTime % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

    let timeLeftStr = diffDays > 0 ? `${diffDays} ngày ${diffHours} giờ` : `${diffHours} giờ`;
    const expiryDateStr = expiryDate.toISOString().split('T')[0];

    return { timeLeftStr, expiryDateStr, rawExpiry: expiryDate.toISOString() };
}

async function handleIncomingMessage(api, event) {
    const { threadID, senderID, body, type, messageReply, logMessageType, author } = event;
    const threadId = threadID;
    const senderId = senderID || author;
    const text = body ? body.trim() : "";

    if (antiSettings[threadId] && senderId !== ADMIN_ID && senderId !== api.getCurrentUserID()) {
        if (logMessageType === "log:thread-name" && antiSettings[threadId].antiName) {
            api.removeUserFromGroup(senderId, threadId, (err) => {
                if (err) console.error("Lỗi kick thành viên đổi tên:", err);
            });
            return;
        }
    }

    if (!text) return;

    if (/^cpr\d+$/i.test(text)) {
        const targetPts = parseInt(text.replace(/cpr/i, ""));
        const groupTeams = teams[threadId] || [];

        if (groupTeams.length === 0) {
            await api.sendMessage({ body: "⚠️ Danh sách .hs list của nhóm đang trống! Vui lòng thêm team bằng lệnh .hs add trước." }, threadId);
            return;
        }

        let resultText = `📊 TÍNH TOÁN CPR MỤC TIÊU: ${targetPts} ĐIỂM\n`;
        resultText += `----------------------------------\n`;
        
        groupTeams.forEach((team, index) => {
            resultText += `${index + 1}. ${team.name}.${team.id} ➔ Cần tối ưu để đạt ${targetPts} pts\n`;
        });
        
        resultText += `----------------------------------\n`;
        resultText += `💡 Dựa trên danh sách .hs list hiện tại của nhóm.`;

        await api.sendMessage({ body: resultText }, threadId);
        return;
    }

    if (text === ".hs all") {
        if (senderId !== ADMIN_ID) {
            await api.sendMessage({ body: "❌ Chỉ Admin mới được xóa toàn bộ danh sách team!" }, threadId);
            return;
        }

        teams[threadId] = [];
        saveDatabase();

        await api.sendMessage({ body: "🗑️ Đã xóa toàn bộ dữ liệu trong danh sách .hs list của nhóm này!" }, threadId);
        return;
    }

    if (text.startsWith(".hs xoa ")) {
        const query = text.slice(8).trim();
        if (!query) {
            await api.sendMessage({ body: "⚠️ Vui lòng nhập tên team hoặc ID cần xóa! Ví dụ: .hs xoa TeamA" }, threadId);
            return;
        }

        if (!teams[threadId] || teams[threadId].length === 0) {
            await api.sendMessage({ body: "📋 Danh sách team hiện đang trống!" }, threadId);
            return;
        }

        const initialLength = teams[threadId].length;
        teams[threadId] = teams[threadId].filter(team => {
            const fullName = `${team.name}.${team.id}`.toLowerCase();
            const target = query.toLowerCase();
            return team.name.toLowerCase() !== target && 
                   team.id.toLowerCase() !== target && 
                   fullName !== target &&
                   !fullName.includes(target);
        });

        if (teams[threadId].length === initialLength) {
            await api.sendMessage({ body: `⚠️ Không tìm thấy team phù hợp với "${query}" trong danh sách!` }, threadId);
            return;
        }

        saveDatabase();
        await api.sendMessage({ body: `✅ Đã xóa thành công team khớp với "${query}" khỏi danh sách .hs list!` }, threadId);
        return;
    }

    if (text.startsWith(".hs add ")) {
        const content = text.slice(8).trim();
        const firstSpaceIndex = content.indexOf(" ");

        if (firstSpaceIndex === -1) {
            await api.sendMessage({ body: "⚠️ Cú pháp sai! Dùng: .hs add [id game] [tên team]" }, threadId);
            return;
        }

        const gameId = content.slice(0, firstSpaceIndex).trim();
        const teamName = content.slice(firstSpaceIndex + 1).trim();

        if (!gameId || !teamName) {
            await api.sendMessage({ body: "⚠️ ID game hoặc tên team không được để trống!" }, threadId);
            return;
        }

        if (!teams[threadId]) {
            teams[threadId] = [];
        }

        teams[threadId].push({ id: gameId, name: teamName });
        saveDatabase();

        await api.sendMessage({ body: `✅ Đã thêm thành công team [${teamName}] với ID [${gameId}] vào danh sách!` }, threadId);
        return;
    }

    if (text.startsWith(".hs list")) {
        const groupTeams = teams[threadId] || [];

        if (groupTeams.length === 0) {
            await api.sendMessage({ body: "📋 Danh sách team hiện đang trống!" }, threadId);
            return;
        }

        let listMsg = `📋 Danh sách team (Trang 1/1):\n`;
        groupTeams.forEach((team, index) => {
            listMsg += `${index + 1}. ${team.name}.${team.id}\n`;
        });
        listMsg += "\nReply số thứ tự để xem info | del + stt để xóa | page [số] để chuyển trang.";

        await api.sendMessage({ body: listMsg }, threadId);
        return;
    }

    if (text.startsWith(".td ") || text.startsWith(".tdtp ")) {
        const parts = text.split(" ").filter(p => p.trim() !== "");
        const gameId = parts[1];

        if (!gameId) {
            await api.sendMessage({ body: "⚠️ Vui lòng nhập ID game! Ví dụ: .td 12345 hoặc .td 12345 xoa2" }, threadId);
            return;
        }

        let deletedIndexNum = null;
        const xoaParam = parts.find(p => /^xoa\d+$/i.test(p));
        if (xoaParam) {
            const matchIndex = parseInt(xoaParam.replace(/xoa/i, "")) - 1;
            if (teams[threadId] && teams[threadId].length > 0) {
                if (matchIndex >= 0 && matchIndex < teams[threadId].length) {
                    deletedIndexNum = matchIndex + 1;
                    teams[threadId].splice(matchIndex, 1);
                    saveDatabase();
                }
            }
        }

        const timeSlotMenu = `⏳ Vui lòng chọn khung giờ tính điểm [ID: ${gameId}]${deletedIndexNum ? ` [XoaSTT:${deletedIndexNum}]` : ""}:

1. 13:00 ➟ 15:00
2. 15:00 ➟ 17:00
3. 18:00 ➟ 20:00
4. 20:00 ➟ 21:50
5. 21:40 ➟ 23:30
6. 23:00 ➟ 01:00
7. 01:00 ➟ 03:00
8. 10:00 ➟ 12:00

• Hướng dẫn sử dụng:
.tdlg [id] [xoaN] [cprN]
.tdlg [id] [key] [xoaN] [cprN]

• Chú thích:
  » xoaN: Xóa trận lỗi (N là STT trận, vd: xoa1,2,3)
  » cprN: Tính CPR (N là điểm CPR cần đạt, vd: cpr41)

📌 Trả lời (reply/quote) tin nhắn này bằng số tương ứng để chọn khung giờ.
(Có thể chọn nhiều khung giờ, cách nhau bằng dấu phẩy, vd: 3,4)`;

        await api.sendMessage({ body: timeSlotMenu }, threadId);
        return;
    }

    if (text === ".td" || text === ".tdtp") {
        const now = new Date();
        const dateStr = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}`;
        const remainingTurnStr = getAndDecreaseTurn(threadId, senderId);
        const imagePath = path.join(__dirname, '288.jpg');

        const guideMenu = `🤖 THP BOT
📊 ID: Không rõ
🎯 Số trận: 1
⏳ Khung giờ: ${dateStr}
🔑 Key: THP
🎟 Bạn còn lại: ${remainingTurnStr}

• Hướng dẫn sử dụng:
.tdlg [id] [xoaN] [cprN]
.tdlg [id] [key] [xoaN] [cprN]

• Chú thích:
  » xoaN: Xóa trận lỗi (N là STT trận, vd: xoa1,2,3)
  » cprN: Tính CPR (N là điểm CPR cần đạt, vd: cpr41)`;

        let msgOptions = {
            body: guideMenu
        };

        if (fs.existsSync(imagePath)) {
            msgOptions.attachment = fs.createReadStream(imagePath);
        }

        await api.sendMessage(msgOptions, threadId);
        return;
    }

    if (messageReply && messageReply.body && messageReply.body.includes("⏳ Vui lòng chọn khung giờ tính điểm:")) {
        const timeSlots = {
            "1": "13:00 ➟ 15:00",
            "2": "15:00 ➟ 17:00",
            "3": "18:00 ➟ 20:00",
            "4": "20:00 ➟ 21:50",
            "5": "21:40 ➟ 23:30",
            "6": "23:00 ➟ 01:00",
            "7": "01:00 ➟ 03:00",
            "8": "10:00 ➟ 12:00"
        };

        const choices = text.split(",").map(s => s.trim());
        const selectedSlots = [];
        let isValid = true;

        for (const c of choices) {
            if (timeSlots[c]) {
                selectedSlots.push(timeSlots[c]);
            } else {
                isValid = false;
                break;
            }
        }

        if (!isValid || selectedSlots.length === 0) {
            await api.sendMessage("⚠️ Lựa chọn không hợp lệ! Vui lòng reply lại bằng số (ví dụ: 3,4 hoặc 1).", threadId);
            return;
        }

        let gameIdMatch = messageReply.body.match(/\[ID:\s*([^\]]+)\]/);
        let gameId = gameIdMatch ? gameIdMatch[1] : "Không rõ";

        let xoaMatch = messageReply.body.match(/\[XoaSTT:\s*(\d+)\]/);
        let xoaLine = xoaMatch ? `🗑️ Đã xóa: ${xoaMatch[1]}\n` : "";

        const timeFormatted = `${selectedSlots.join(", ")}`;
        const remainingTurnStr = getAndDecreaseTurn(threadId, senderId);
        const imagePath = path.join(__dirname, '288.jpg');

        let resultMessage = `🤖 THP BOT
📊 ID: ${gameId}
🎯 Số trận: 1
⏳ Khung giờ: ${timeFormatted}
🔑 Key: THP
`;
        if (xoaLine) {
            resultMessage += xoaLine;
        }
        resultMessage += `🎟 Bạn còn lại: ${remainingTurnStr}`;

        let msgOptions = {
            body: resultMessage
        };

        if (fs.existsSync(imagePath)) {
            msgOptions.attachment = fs.createReadStream(imagePath);
        }

        await api.sendMessage(msgOptions, threadId);
        return;
    }

    if (text.startsWith(".tg")) {
        api.getThreadInfo(threadId, async (err, info) => {
            const boxName = (!err && info && info.threadName) ? info.threadName : "Nhóm này";
            const args = text.split(/\s+/);
            const subCommand = args[1] ? args[1].toLowerCase() : "";

            if (subCommand === "30ngay") {
                if (senderId !== ADMIN_ID) {
                    await api.sendMessage({ body: "❌ Chỉ chủ bot mới có quyền gia hạn thời gian thuê!" }, threadId);
                    return;
                }
                const currentData = groupRentalExpiry[threadId];
                const calc = calculateRental(currentData, 30, false);
                groupRentalExpiry[threadId] = calc.rawExpiry;
                saveDatabase();

                const replyMsg = `📅 THÔNG BÁO BOX ĐƯỢC GIA HẠN THUÊ BOT
📦 Nhóm:
${boxName}
⏳ Thời hạn còn lại:
${calc.timeLeftStr}
📆 Hết hạn:
${calc.expiryDateStr}
💙 Cảm ơn bạn đã sử dụng dịch vụ thuê BOT THP của chúng tôi.`;

                await api.sendMessage({ body: replyMsg }, threadId);
                return;
            }

            if (subCommand === "vohan") {
                if (senderId !== ADMIN_ID) {
                    await api.sendMessage({ body: "❌ Chỉ chủ bot mới có quyền cấp vĩnh viễn!" }, threadId);
                    return;
                }
                groupRentalExpiry[threadId] = "vohan";
                saveDatabase();

                const replyMsg = `📅 THÔNG BÁO BOX ĐƯỢC GIA HẠN THUÊ BOT
📦 Nhóm:
${boxName}
⏳ Thời hạn còn lại:
Vĩnh viễn
📆 Hết hạn:
Vĩnh viễn
💙 Cảm ơn bạn đã sử dụng dịch vụ thuê BOT THP của chúng tôi.`;

                await api.sendMessage({ body: replyMsg }, threadId);
                return;
            }

            const currentData = groupRentalExpiry[threadId];
            let calc;
            if (currentData === "vohan") {
                calc = { timeLeftStr: "Vĩnh viễn", expiryDateStr: "Vĩnh viễn" };
            } else {
                calc = calculateRental(currentData, null, false);
            }

            const statusMsg = `📅 THÔNG BÁO THỜI HẠN THUÊ BOT
📦 Nhóm:
${boxName}
⏳ Thời hạn còn lại:
${calc.timeLeftStr}
📆 Hết hạn:
${calc.expiryDateStr}
💙 Cảm ơn bạn đã sử dụng dịch vụ thuê BOT THP của chúng tôi.`;

            await api.sendMessage({ body: statusMsg }, threadId);
        });
        return;
    }

    if (messageReply && messageReply.body && messageReply.body.includes("📑 BOT THP") && messageReply.body.includes("Reply số")) {
        if (senderId !== ADMIN_ID) {
            await api.sendMessage("❌ Chỉ Admin mới được cấu hình Anti!", threadId);
            return;
        }
        const choice = parseInt(text);
        if (isNaN(choice) || choice < 1 || choice > 8) {
            await api.sendMessage("⚠️ Lựa chọn không hợp lệ! Vui lòng reply một số từ 1 đến 8.", threadId);
            return;
        }

        if (!antiSettings[threadId]) {
            antiSettings[threadId] = { antiLink: false, antiTagAll: false, antiName: false, antiAdmin: false, antiLeave: false, antiImage: false, antiSpam: false };
        }

        let featName = "";
        switch(choice) {
            case 1:
                antiSettings[threadId].antiLink = !antiSettings[threadId].antiLink;
                featName = "Anti gửi link";
                break;
            case 2:
                antiSettings[threadId].antiTagAll = !antiSettings[threadId].antiTagAll;
                featName = "Anti tag all";
                break;
            case 3:
            case 7:
                antiSettings[threadId].antiName = !antiSettings[threadId].antiName;
                featName = "Anti đổi tên nhóm";
                break;
            case 4:
                antiSettings[threadId].antiAdmin = !antiSettings[threadId].antiAdmin;
                featName = "Anti thay đổi QTV";
                break;
            case 5:
                antiSettings[threadId].antiLeave = !antiSettings[threadId].antiLeave;
                featName = "Anti rời nhóm";
                break;
            case 6:
                antiSettings[threadId].antiImage = !antiSettings[threadId].antiImage;
                featName = "Anti đổi ảnh nhóm";
                break;
            case 8:
                antiSettings[threadId].antiSpam = !antiSettings[threadId].antiSpam;
                featName = "Anti đổi spam tin nhắn";
                break;
        }

        saveDatabase();
        await api.sendMessage(`🛡 Đã cập nhật tính năng [${featName}] thành công cho nhóm này!`, threadId);
        return;
    }

    if (text === ".anti") {
        if (senderId !== ADMIN_ID) {
            await api.sendMessage("❌ Chỉ Admin mới được dùng lệnh này!", threadId);
            return;
        }
        const menuMsg = `📑 BOT THP
──────────────
1. Anti gửi link 
2. Anti tag all
3. Anti đổi tên nhóm 
4. Anti thay đổi QTV
5. Anti rời nhóm 
6. Anti đổi ảnh nhóm 
7. Anti đổi tên nhóm                           
8. Anti đổi spam tin nhắn  
──────────────
↩️ Reply số (1-8) để chọn.`;
        await api.sendMessage(menuMsg, threadId);
        return;
    }

    if (text.startsWith(".tangluot ")) {
        if (senderId !== ADMIN_ID) {
            await api.sendMessage({ body: "❌ Chỉ chủ bot mới có quyền sử dụng lệnh này!" }, threadId);
            return;
        }
        const args = text.split(" ");
        const targetUserId = args[1];
        const amount = parseInt(args[2]);

        if (!targetUserId || isNaN(amount)) {
            await api.sendMessage({ body: "⚠️ Cú pháp sai! Dùng: .tangluot [UID] [số lượt]" }, threadId);
            return;
        }

        const personalKey = `${threadId}_${targetUserId}`;
        if (userRemainingTurns[personalKey] === undefined) userRemainingTurns[personalKey] = 100;
        userRemainingTurns[personalKey] += amount;
        saveDatabase();

        await api.sendMessage({ body: `✅ Đã tăng ${amount} lượt cho user ${targetUserId}. Tổng hiện tại: ${userRemainingTurns[personalKey]} lượt.` }, threadId);
        return;
    }

    if (text.startsWith(".giamluot ")) {
        if (senderId !== ADMIN_ID) {
            await api.sendMessage({ body: "❌ Chỉ chủ bot mới có quyền sử dụng lệnh này!" }, threadId);
            return;
        }
        const args = text.split(" ");
        const targetUserId = args[1];
        const amount = parseInt(args[2]);

        if (!targetUserId || isNaN(amount)) {
            await api.sendMessage({ body: "⚠️ Cú pháp sai! Dùng: .giamluot [UID] [số lượt]" }, threadId);
            return;
        }

        const personalKey = `${threadId}_${targetUserId}`;
        if (userRemainingTurns[personalKey] === undefined) userRemainingTurns[personalKey] = 100;
        
        userRemainingTurns[personalKey] = Math.max(0, userRemainingTurns[personalKey] - amount);
        saveDatabase();

        await api.sendMessage({ body: `✅ Đã giảm ${amount} lượt của user ${targetUserId}. Tổng hiện tại: ${userRemainingTurns[personalKey]} lượt.` }, threadId);
        return;
    }

    if (text === ".luotdung") {
        const personalKey = `${threadId}_${senderId}`;
        if (userRemainingTurns[personalKey] === undefined) userRemainingTurns[personalKey] = 100;
        await api.sendMessage({ body: `📋 Lượt dùng của bạn: ${userRemainingTurns[personalKey]} lượt` }, threadId);
        return;
    }
}

if (fs.existsSync('appstate.json')) {
    const appState = JSON.parse(fs.readFileSync('appstate.json', 'utf8'));
    login({ appState: appState }, (err, api) => {
        if (err) return console.error("Lỗi đăng nhập bot:", err);

        console.log("THP Bot script loaded successfully!");

        api.listenMqtt((err, event) => {
            if (err) return console.error("Lỗi lắng nghe sự kiện:", err);
            if (event.type === "message" || event.type === "event" || event.logMessageType) {
                handleIncomingMessage(api, event);
            }
        });
    });
} else {
    console.log("Không tìm thấy file appstate.json! Vui lòng bỏ appstate vào thư mục C:\\bot\\thp-bot");
}
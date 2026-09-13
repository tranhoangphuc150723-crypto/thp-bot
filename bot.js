/**
 * THP BOT - ZALO VERSION (COMPLETE WITH EXPRESS SERVER & DYNAMIC ADMIN CLAIMING)
 */
const fs = require('fs');
const path = require('path');
const { Zalo, ThreadType } = require('zca-js');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('THP Zalo Bot is running 24/7!');
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
                teams: data.teams || {},
                adminId: data.adminId || null
            };
        } catch (e) {
            console.error("Lỗi đọc database:", e);
        }
    }
    return { userRemainingTurns: {}, groupTeamProfiles: {}, groupRentalExpiry: {}, antiSettings: {}, teams: {}, adminId: null };
}

let db = loadDatabase();
let userRemainingTurns = db.userRemainingTurns;
let groupTeamProfiles = db.groupTeamProfiles;
let groupRentalExpiry = db.groupRentalExpiry;
let antiSettings = db.antiSettings;
let teams = db.teams;
let ADMIN_ID = db.adminId; // Được nhận diện động qua lệnh .chu hoặc .chủ

function saveDatabase() {
    const data = { userRemainingTurns, groupTeamProfiles, groupRentalExpiry, antiSettings, teams, adminId: ADMIN_ID };
    fs.writeFileSync(dbFile, JSON.stringify(data, null, 2));
}

const COOKIE_STRING = "DÁN_CHUỖI_COOKIE_CỦA_BẠN_VÀO_ĐÂY";

function getAndDecreaseTurn(threadId, senderId = null) {
    if (ADMIN_ID && senderId === ADMIN_ID) {
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
        return { timeLeftStr: "Vĩnh viễn", expiryDateStr: "Vĩnh viễn" };
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

async function handleIncomingMessage(api, message) {
    const threadId = message.threadId;
    const senderId = message.uidFrom;
    const content = message.data && message.data.content ? message.data.content.trim() : "";
    const threadType = message.type;
    const messageReply = message.data && message.data.quote ? message.data.quote : null;

    if (!content) return;
    const text = content;

    if (text === ".chủ" || text === ".chu") {
        if (!ADMIN_ID) {
            ADMIN_ID = senderId;
            saveDatabase();
            await api.sendMessage({ msg: "🟢bạn là chủ 🤖BOT THP 🤖 này ❤️❤️❤️" }, threadId, threadType);
            return;
        }

        if (senderId === ADMIN_ID) {
            await api.sendMessage({ msg: "🟢bạn là chủ 🤖BOT THP 🤖 này ❤️❤️❤️" }, threadId, threadType);
        } else {
            await api.sendMessage({ msg: "❌mầy dell đủ năng lực ok" }, threadId, threadType);
        }
        return;
    }

    if (/^cpr\d+$/i.test(text)) {
        const targetPts = parseInt(text.replace(/cpr/i, ""));
        const groupTeams = teams[threadId] || [];

        if (groupTeams.length === 0) {
            await api.sendMessage({ msg: "⚠️ Danh sách .hs list của nhóm đang trống! Vui lòng thêm team bằng lệnh .hs add trước." }, threadId, threadType);
            return;
        }

        let resultText = `📊 TÍNH TOÁN CPR MỤC TIÊU: ${targetPts} ĐIỂM\n`;
        resultText += `----------------------------------\n`;
        groupTeams.forEach((team, index) => {
            resultText += `${index + 1}. ${team.name}.${team.id} ➔ Cần tối ưu để đạt ${targetPts} pts\n`;
        });
        resultText += `----------------------------------\n`;
        resultText += `💡 Dựa trên danh sách .hs list hiện tại của nhóm.`;

        await api.sendMessage({ msg: resultText }, threadId, threadType);
        return;
    }

    if (text === ".hs all") {
        if (ADMIN_ID && senderId !== ADMIN_ID) {
            await api.sendMessage({ msg: "❌ Chỉ Admin mới được xóa toàn bộ danh sách team!" }, threadId, threadType);
            return;
        }
        teams[threadId] = [];
        saveDatabase();
        await api.sendMessage({ msg: "🗑️ Đã xóa toàn bộ dữ liệu trong danh sách .hs list của nhóm này!" }, threadId, threadType);
        return;
    }

    if (text.startsWith(".hs xoa ")) {
        const query = text.slice(8).trim();
        if (!query) {
            await api.sendMessage({ msg: "⚠️ Vui lòng nhập tên team hoặc ID cần xóa! Ví dụ: .hs xoa TeamA" }, threadId, threadType);
            return;
        }
        if (!teams[threadId] || teams[threadId].length === 0) {
            await api.sendMessage({ msg: "📋 Danh sách team hiện đang trống!" }, threadId, threadType);
            return;
        }
        const initialLength = teams[threadId].length;
        teams[threadId] = teams[threadId].filter(team => {
            const fullName = `${team.name}.${team.id}`.toLowerCase();
            const target = query.toLowerCase();
            return team.name.toLowerCase() !== target && team.id.toLowerCase() !== target && fullName !== target && !fullName.includes(target);
        });
        if (teams[threadId].length === initialLength) {
            await api.sendMessage({ msg: `⚠️ Không tìm thấy team phù hợp với "${query}" trong danh sách!` }, threadId, threadType);
            return;
        }
        saveDatabase();
        await api.sendMessage({ msg: `✅ Đã xóa thành công team khớp với "${query}" khỏi danh sách .hs list!` }, threadId, threadType);
        return;
    }

    if (text.startsWith(".hs add ")) {
        const contentStr = text.slice(8).trim();
        const firstSpaceIndex = contentStr.indexOf(" ");
        if (firstSpaceIndex === -1) {
            await api.sendMessage({ msg: "⚠️ Cú pháp sai! Dùng: .hs add [id game] [tên team]" }, threadId, threadType);
            return;
        }
        const gameId = contentStr.slice(0, firstSpaceIndex).trim();
        const teamName = contentStr.slice(firstSpaceIndex + 1).trim();
        if (!gameId || !teamName) {
            await api.sendMessage({ msg: "⚠️ ID game hoặc tên team không được để trống!" }, threadId, threadType);
            return;
        }
        if (!teams[threadId]) teams[threadId] = [];
        teams[threadId].push({ id: gameId, name: teamName });
        saveDatabase();
        await api.sendMessage({ msg: `✅ Đã thêm thành công team [${teamName}] với ID [${gameId}] vào danh sách!` }, threadId, threadType);
        return;
    }

    if (text.startsWith(".hs list")) {
        const groupTeams = teams[threadId] || [];
        if (groupTeams.length === 0) {
            await api.sendMessage({ msg: "📋 Danh sách team hiện đang trống!" }, threadId, threadType);
            return;
        }
        let listMsg = `📋 Danh sách team (Trang 1/1):\n`;
        groupTeams.forEach((team, index) => {
            listMsg += `${index + 1}. ${team.name}.${team.id}\n`;
        });
        listMsg += "\nReply số thứ tự để xem info | del + stt để xóa.";
        await api.sendMessage({ msg: listMsg }, threadId, threadType);
        return;
    }

    if (text.startsWith(".td ") || text.startsWith(".tdtp ")) {
        const parts = text.split(" ").filter(p => p.trim() !== "");
        const gameId = parts[1];
        if (!gameId) {
            await api.sendMessage({ msg: "⚠️ Vui lòng nhập ID game! Ví dụ: .td 12345" }, threadId, threadType);
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

📌 Trả lời (reply) tin nhắn này bằng số tương ứng (vd: 3,4)`;

        await api.sendMessage({ msg: timeSlotMenu }, threadId, threadType);
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
🎟 Bạn còn lại: ${remainingTurnStr}`;

        let msgOptions = { msg: guideMenu };
        if (fs.existsSync(imagePath)) msgOptions.filePath = imagePath;

        await api.sendMessage(msgOptions, threadId, threadType);
        return;
    }

    if (messageReply && messageReply.content && messageReply.content.includes("⏳ Vui lòng chọn khung giờ tính điểm:")) {
        const timeSlots = {
            "1": "13:00 ➟ 15:00", "2": "15:00 ➟ 17:00", "3": "18:00 ➟ 20:00", "4": "20:00 ➟ 21:50",
            "5": "21:40 ➟ 23:30", "6": "23:00 ➟ 01:00", "7": "01:00 ➟ 03:00", "8": "10:00 ➟ 12:00"
        };
        const choices = text.split(",").map(s => s.trim());
        const selectedSlots = [];
        let isValid = true;
        for (const c of choices) {
            if (timeSlots[c]) selectedSlots.push(timeSlots[c]);
            else { isValid = false; break; }
        }
        if (!isValid || selectedSlots.length === 0) {
            await api.sendMessage({ msg: "⚠️ Lựa chọn không hợp lệ! Vui lòng reply lại bằng số (ví dụ: 3,4 hoặc 1)." }, threadId, threadType);
            return;
        }

        let gameIdMatch = messageReply.content.match(/\[ID:\s*([^\]]+)\]/);
        let gameId = gameIdMatch ? gameIdMatch[1] : "Không rõ";
        let xoaMatch = messageReply.content.match(/\[XoaSTT:\s*(\d+)\]/);
        let xoaLine = xoaMatch ? `🗑️ Đã xóa: ${xoaMatch[1]}\n` : "";

        const timeFormatted = `${selectedSlots.join(", ")}`;
        const remainingTurnStr = getAndDecreaseTurn(threadId, senderId);
        const imagePath = path.join(__dirname, '288.jpg');

        let resultMessage = `🤖 THP BOT\n📊 ID: ${gameId}\n🎯 Số trận: 1\n⏳ Khung giờ: ${timeFormatted}\n🔑 Key: THP\n`;
        if (xoaLine) resultMessage += xoaLine;
        resultMessage += `🎟 Bạn còn lại: ${remainingTurnStr}`;

        let msgOptions = { msg: resultMessage };
        if (fs.existsSync(imagePath)) msgOptions.filePath = imagePath;

        await api.sendMessage(msgOptions, threadId, threadType);
        return;
    }

    if (text.startsWith(".tg")) {
        const boxName = "Nhóm Zalo này";
        const args = text.split(/\s+/);
        const subCommand = args[1] ? args[1].toLowerCase() : "";

        if (subCommand === "30ngay") {
            if (ADMIN_ID && senderId !== ADMIN_ID) {
                await api.sendMessage({ msg: "❌ Chỉ chủ bot mới có quyền gia hạn thời gian thuê!" }, threadId, threadType);
                return;
            }
            const currentData = groupRentalExpiry[threadId];
            const calc = calculateRental(currentData, 30, false);
            groupRentalExpiry[threadId] = calc.rawExpiry;
            saveDatabase();
            await api.sendMessage({ msg: `📅 GIA HẠN THÀNH CÔNG\n📦 Nhóm: ${boxName}\n⏳ Còn lại: ${calc.timeLeftStr}\n📆 Hết hạn: ${calc.expiryDateStr}` }, threadId, threadType);
            return;
        }
        if (subCommand === "vohan") {
            if (ADMIN_ID && senderId !== ADMIN_ID) {
                await api.sendMessage({ msg: "❌ Chỉ chủ bot mới có quyền cấp vĩnh viễn!" }, threadId, threadType);
                return;
            }
            groupRentalExpiry[threadId] = "vohan";
            saveDatabase();
            await api.sendMessage({ msg: `📅 CẤP VĨNH VIỄN THÀNH CÔNG\n📦 Nhóm: ${boxName}\n⏳ Thời hạn: Vĩnh viễn` }, threadId, threadType);
            return;
        }

        const currentData = groupRentalExpiry[threadId];
        let calc = (currentData === "vohan") ? { timeLeftStr: "Vĩnh viễn", expiryDateStr: "Vĩnh viễn" } : calculateRental(currentData, null, false);
        await api.sendMessage({ msg: `📅 THÔNG BÁO THỜI HẠN THUÊ BOT\n📦 Nhóm: ${boxName}\n⏳ Còn lại: ${calc.timeLeftStr}\n📆 Hết hạn: ${calc.expiryDateStr}` }, threadId, threadType);
        return;
    }

    if (messageReply && messageReply.content && messageReply.content.includes("📑 BOT THP") && messageReply.content.includes("Reply số")) {
        let isOwner = (ADMIN_ID && senderId === ADMIN_ID);
        let isGroupAdminOrDeputy = false;
        try {
            const groupInfo = await api.getGroupInfo(threadId);
            if (groupInfo && groupInfo.gridInfo) {
                const owners = groupInfo.gridInfo.ownerList || [];
                const deputies = groupInfo.gridInfo.deputyList || [];
                if (owners.includes(senderId) || deputies.includes(senderId)) isGroupAdminOrDeputy = true;
            }
        } catch (e) {}

        if (!isOwner && !isGroupAdminOrDeputy) {
            await api.sendMessage({ msg: "❌mầy dell đủ năng lực ok" }, threadId, threadType);
            return;
        }

        const choice = parseInt(text);
        if (isNaN(choice) || choice < 1 || choice > 8) {
            await api.sendMessage({ msg: "⚠️ Lựa chọn không hợp lệ! Vui lòng reply số từ 1 đến 8." }, threadId, threadType);
            return;
        }

        if (!antiSettings[threadId]) {
            antiSettings[threadId] = { antiLink: false, antiTagAll: false, antiName: false, antiAdmin: false, antiLeave: false, antiImage: false, antiSpam: false };
        }

        let featName = "";
        switch(choice) {
            case 1: antiSettings[threadId].antiLink = !antiSettings[threadId].antiLink; featName = "Anti gửi link"; break;
            case 2: antiSettings[threadId].antiTagAll = !antiSettings[threadId].antiTagAll; featName = "Anti tag all"; break;
            case 3:
            case 7: antiSettings[threadId].antiName = !antiSettings[threadId].antiName; featName = "Anti đổi tên nhóm"; break;
            case 4: antiSettings[threadId].antiAdmin = !antiSettings[threadId].antiAdmin; featName = "Anti thay đổi QTV"; break;
            case 5: antiSettings[threadId].antiLeave = !antiSettings[threadId].antiLeave; featName = "Anti rời nhóm"; break;
            case 6: antiSettings[threadId].antiImage = !antiSettings[threadId].antiImage; featName = "Anti đổi ảnh nhóm"; break;
            case 8: antiSettings[threadId].antiSpam = !antiSettings[threadId].antiSpam; featName = "Anti spam tin nhắn"; break;
        }

        saveDatabase();
        await api.sendMessage({ msg: `🛡 Đã cập nhật tính năng [${featName}] thành công!` }, threadId, threadType);
        return;
    }

    if (text === ".anti") {
        let isOwner = (ADMIN_ID && senderId === ADMIN_ID);
        let isGroupAdminOrDeputy = false;
        try {
            const groupInfo = await api.getGroupInfo(threadId);
            if (groupInfo && groupInfo.gridInfo) {
                const owners = groupInfo.gridInfo.ownerList || [];
                const deputies = groupInfo.gridInfo.deputyList || [];
                if (owners.includes(senderId) || deputies.includes(senderId)) isGroupAdminOrDeputy = true;
            }
        } catch (e) {}

        if (!isOwner && !isGroupAdminOrDeputy) {
            await api.sendMessage({ msg: "❌mầy dell đủ năng lực ok" }, threadId, threadType);
            return;
        }

        const menuMsg = `📑 BOT THP\n──────────────\n1. Anti gửi link \n2. Anti tag all\n3. Anti đổi tên nhóm \n4. Anti thay đổi QTV\n5. Anti rời nhóm \n6. Anti đổi ảnh nhóm \n7. Anti đổi tên nhóm\n8. Anti spam tin nhắn\n──────────────\n↩️ Reply số (1-8) để chọn.`;
        await api.sendMessage({ msg: menuMsg }, threadId, threadType);
        return;
    }

    if (text === ".luotdung") {
        const personalKey = `${threadId}_${senderId}`;
        if (userRemainingTurns[personalKey] === undefined) userRemainingTurns[personalKey] = 100;
        await api.sendMessage({ msg: `📋 Lượt dùng của bạn: ${userRemainingTurns[personalKey]} lượt` }, threadId, threadType);
        return;
    }
}

async function startBot() {
    try {
        console.log("Đang khởi động THP Zalo Bot bằng Cookie...");
        const zalo = new Zalo();
        
        const api = await zalo.login({ cookie: COOKIE_STRING });
        console.log("THP Zalo Bot đăng nhập thành công bằng Cookie!");

        api.listener.on("message", async (message) => {
            try {
                if (message.isSelf) return;
                await handleIncomingMessage(api, message);
            } catch (err) {
                console.error("Lỗi lắng nghe tin nhắn:", err);
            }
        });

        api.listener.start();
    } catch (error) {
        console.log("Lỗi đăng nhập Cookie Zalo:", error);
    }
}

startBot();

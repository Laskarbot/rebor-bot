const fs = require('fs');
const axios = require('axios');
const userAgents = require('./userAgents');

console.log("====================================");
console.log("       SELAMAT DATANG BOT AUTO!     ");
console.log("       Nama:      LASKAR-BOT        ");
console.log("====================================");

// Baca konfigurasi dari config.json
const config = JSON.parse(fs.readFileSync('config.json', 'utf-8'));
const TASK_IDS = config.taskIds;
const DELAY = config.delayBetweenRequests;
const PROFILE_URL = config.apiEndpoints.profile;
const TASK_URL = config.apiEndpoints.task;

// Baca token dari file tokens.txt
const tokens = fs.readFileSync('tokens.txt', 'utf-8')
    .split('\n')
    .map(t => t.trim())
    .filter(t => t);

const totalTokens = tokens.length;
console.log(`🔍 Ditemukan ${totalTokens} akun untuk diproses.\n`);

// Delay 2 detik sebelum memulai
setTimeout(async () => {
    console.log("🔄 Memulai proses auto login dan klaim semua task harian...\n");

    let akunKe = 0;
    for (const token of tokens) {
        akunKe++;
        console.log(`🔄 Memproses akun ke-${akunKe} dari ${totalTokens}...\n`);
        await loginAndClaimTasks(token);
    }

    console.log("✅ Proses selesai! Semua token telah diproses.");
}, 2000);

async function loginAndClaimTasks(token) {
    try {
        const randomUserAgent = userAgents[Math.floor(Math.random() * userAgents.length)];

        let retryCount = 0;
        const maxRetries = 5; // BATAS MAKSIMAL RETRY UNTUK 429

        while (retryCount < maxRetries) {
            try {
                // Step 1: Ambil data user
                const profileResponse = await axios.get(PROFILE_URL, {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'User-Agent': randomUserAgent,
                        'Accept': 'application/json, text/plain, */*'
                    }
                });

                if (profileResponse.data.status !== "success") {
                    console.log("❌ Token Anda salah\n");
                    return;
                }

                const user = profileResponse.data.user;
                console.log(`✅ Berhasil login! Username: ${user.username}, Coin: ${user.coin}, User-Agent: ${randomUserAgent}\n`);

                // Step 2: Loop semua task ID dan klaim satu per satu
                for (const taskId of TASK_IDS) {
                    const taskPayload = {
                        telegramId: user.telegramId,
                        taskId: taskId,
                        type: "daily",
                        action: "complete"
                    };

                    console.log(`🔄 Mengklaim ${taskId === 1 ? "Daily Check-In" : `task ${taskId}`} untuk ${user.username}...`);

                    let success = false;
                    while (!success) {
                        try {
                            const taskResponse = await axios.post(TASK_URL, taskPayload, {
                                headers: {
                                    'Authorization': `Bearer ${token}`,
                                    'User-Agent': randomUserAgent,
                                    'Accept': 'application/json, text/plain, */*',
                                    'Content-Type': 'application/json'
                                }
                            });

                            if (taskResponse.data.success) {
                                console.log(`🎉 Task ${taskId} berhasil diklaim! Reward: ${taskResponse.data.reward}, Total Coin: ${taskResponse.data.totalCoins}\n`);
                                success = true;
                            } else {
                                console.log(`⚠️ Gagal klaim task ${taskId} untuk ${user.username}. Response:`, taskResponse.data);
                                success = true;
                            }
                        } catch (taskError) {
                            if (taskError.response) {
                                if (taskError.response.status === 400) {
                                    console.log(`✅ Task ${taskId} sudah diklaim sebelumnya.\n`);
                                    success = true;
                                } else if (taskError.response.status === 429) {
                                    const retryAfter = parseInt(taskError.response.data.retryAfter, 10) || 60;
                                    console.log(`⏳ Terlalu banyak permintaan. Menunggu ${retryAfter} detik sebelum mencoba lagi...`);
                                    await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
                                } else {
                                    console.log(`❌ Error saat klaim task ${taskId} untuk ${user.username}. Status: ${taskError.response.status}, Response:`, taskError.response.data);
                                    success = true;
                                }
                            } else {
                                console.log(`❌ Error saat klaim task ${taskId} untuk ${user.username}:`, taskError.message);
                                success = true;
                            }
                        }
                    }

                    // Tambahkan delay untuk menghindari rate limit
                    await new Promise(resolve => setTimeout(resolve, DELAY));
                }
                return;
            } catch (error) {
                if (error.response && error.response.status === 429) {
                    const retryAfter = parseInt(error.response.data.retryAfter, 10) || 60;
                    console.log(`⏳ Terlalu banyak permintaan. Menunggu ${retryAfter} detik sebelum mencoba lagi...`);

                    retryCount++;
                    if (retryCount >= maxRetries) {
                        console.log("⚠️ Akun ini terkena limit terlalu lama. Melewati akun ini...\n");
                        return;
                    }

                    await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
                } else if (error.response && error.response.status === 403) {
                    console.log("❌ Token Anda salah\n");
                    return;
                } else {
                    console.log(`❌ Error saat login dengan token: ${token}`, error.message);
                    return;
                }
            }
        }
    } catch (error) {
        console.log(`❌ Error saat login dengan token: ${token}`, error.message);
    }
}

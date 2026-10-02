# 💧 Focalors Music — Discord Music Bot (Bun + Lavalink v4)

**Focalors Music** คือ Discord Music Bot ประสิทธิภาพสูง พัฒนาด้วย **Bun Runtime (TypeScript)** และ **Lavalink v4 Audio Engine** มาพร้อมแผงควบคุมเพลง (Music Controller UI) ที่เข้าใจง่ายและตอบสนองรวดเร็ว, ระบบคิวเพลงแบบโต้ตอบ (`/fm list`), ระบบบันทึก Playlist ลงฐานข้อมูล SQLite บน Ubuntu Server, และระบบสตรีมวิดีโอแบบ Synchronized ผ่าน Discord Watch Together Activity

---

## ✨ จุดเด่นของ Focalors Music (Key Features)

1. **Clean & Intuitive Music Controller (แผงควบคุมเพลง)**:
   - ปรับปรุงจาก Controller เดิมที่ซับซ้อนให้กลายเป็น 3 แถวที่ชัดเจนและแยกสีตามหน้าที่
   - แถบความคืบหน้าแบบเรียลไทม์ `01:45 🔘────────── 04:12`
   - ปุ่มควบคุมครบครัน: Previous, Rewind (-10s), Play/Pause, Fast-Forward (+10s), Skip, Volume +/-, Loop Mode, Shuffle, Stop, Filters, Autoplay, Save Playlist
2. **Interactive Queue Menu (`/fm list`)**:
   - แสดงคิวเพลงแบบแบ่งหน้า (Pagination)
   - มี **Dropdown Select Menu** ด้านล่าง ให้สมาชิกสามารถกดเลือกเพลงในรายการเพื่อกระโดดข้ามไปเล่นเพลงนั้นได้ทันที
3. **Server-Side Playlist System (`/fm playlist`)**:
   - บันทึกและโหลดเพลย์ลิสต์เพลงได้อย่างรวดเร็ว
   - จัดเก็บบน Ubuntu Server ด้วย **`bun:sqlite`** (Native C++ SQLite ภายใน Bun เร็วสูง ไม่กิน RAM และไม่ต้องลง Database Server เพิ่ม)
4. **Discord Activity Video Mode (`/fm video`)**:
   - รองรับการเปิดห้องดูวิดีโอร่วมกัน (YouTube Watch Together) ถูกกฎ ToS ของ Discord 100% ปลอดภัย ไม่เสี่ยงโดนแบนบัญชี
5. **High Performance & Rate-Limit Protection**:
   - ขับเคลื่อนด้วย Bun Runtime (Zig Engine) ประมวลผล WebSocket และ I/O ได้รวดเร็ว
   - มี **Debounced Message Updater** ป้องกัน Discord 429 Rate Limit แม้ผู้ใช้จะกดปุ่มรัวๆ

---

## 📋 รายการคำสั่งทั้งหมด (Slash Commands: `/fm <command>`)

| คำสั่ง | คำอธิบาย |
|---|---|
| `/fm play <query>` | ค้นหาและเล่นเพลงจาก YouTube, Spotify, SoundCloud, หรือ Direct URL |
| `/fm list [page]` | ดูรายการเพลงในคิวแบบแบ่งหน้า พร้อม Dropdown เลือกเพลงเพื่อข้ามไปเล่นได้ทันที |
| `/fm pause` | หยุดเล่นเพลงชั่วคราว |
| `/fm resume` | เล่นเพลงต่อ |
| `/fm skip [to]` | ข้ามเพลงปัจจุบัน หรือกระโดดไปตามลำดับเพลงที่ระบุ |
| `/fm previous` | ย้อนกลับไปเล่นเพลงก่อนหน้า |
| `/fm stop` | หยุดเล่นเพลง ล้างคิวทั้งหมด และออกจากห้องเสียง |
| `/fm volume <1-150>` | ปรับระดับเสียง (1-150%) |
| `/fm nowplaying` | แสดงการ์ด Controller เพลงที่กำลังเล่นอยู่ในขณะนี้ |
| `/fm loop <off\|track\|queue>` | ตั้งค่าการวนซ้ำ (ปิด / ซ้ำเพลงเดิม / ซ้ำทั้งคิว) |
| `/fm shuffle` | สลับสุ่มลำดับเพลงในคิว |
| `/fm seek <seconds>` | เลื่อนเวลาเพลงไปข้างหน้าหรือย้อนกลับ (วินาที) |
| `/fm filter [preset]` | ปรับแต่งเสียง (Bassboost High/Med, Nightcore, Vaporwave, 8D Audio, Pop EQ) |
| `/fm playlist save <name>` | บันทึกเพลงในคิวปัจจุบันเป็น Playlist ชื่อ `<name>` |
| `/fm playlist load <name>` | โหลดเพลงจาก Playlist `<name>` เข้าสู่คิว |
| `/fm playlist list` | ดูรายชื่อ Playlist ทั้งหมดของคุณที่บันทึกไว้ในเซิร์ฟเวอร์ |
| `/fm playlist delete <name>` | ลบ Playlist ออกจากเซิร์ฟเวอร์ |
| `/fm video [url]` | เปิด Discord Activity (YouTube Watch Together) ดูวิดีโอพร้อมกันในห้องเสียง |
| `/fm status` | ตรวจสอบค่า Ping ของบอท, การทำงานของ Lavalink, CPU, RAM และ Uptime |

---

## 🛠️ โครงสร้างโปรเจกต์ (Project Structure)

```
Focalors-Music-Discord-Bot/
├── application.yml            # การตั้งค่า Lavalink v4 และ Plugins (YouTube, Spotify)
├── docker-compose.yml         # รัน Lavalink v4 ด้วย Docker อย่างง่ายดาย
├── package.json               # Bun dependencies & scripts
├── tsconfig.json              # TypeScript configuration
├── .env.example               # ตัวอย่าง Environment variables
├── scripts/
│   └── setup-ubuntu.sh        # สคริปต์ติดตั้งระบบอัตโนมัติบน Ubuntu Server
├── src/
│   ├── index.ts               # จุดเริ่มต้นของบอทและ Graceful Shutdown
│   ├── config.ts              # โหลดและตรวจสอบการตั้งค่า
│   ├── deploy-commands.ts     # สคริปต์ลงทะเบียน Slash Commands กับ Discord
│   ├── client/
│   │   ├── FocalorsClient.ts  # จัดการ Discord Gateway และ Interaction Event
│   │   └── LavalinkManager.ts # จัดการการเชื่อมต่อ Lavalink v4 และ Player Events
│   ├── commands/
│   │   └── fm.ts              # รวม Subcommands ภายใต้ /fm ทั้งหมด
│   ├── components/
│   │   ├── controller.ts      # สร้าง Controller Embed และปุ่ม ActionRow 3 แถว
│   │   ├── queueMenu.ts       # สร้าง Queue Embed, Dropdown Jump Menu, และ Pagination
│   │   └── filterMenu.ts      # เมนูเลือก Audio Filters
│   ├── database/
│   │   ├── sqlite.ts          # เชื่อมต่อ Bun:sqlite และ Migration ตาราง
│   │   └── playlistRepo.ts    # จัดการข้อมูล Playlists และ Tracks (Transactions)
│   ├── services/
│   │   ├── updater.ts         # ระบบ Debounce อัปเดต Controller ป้องกัน Error 429
│   │   └── activityService.ts # สร้าง Discord Activity Invite สำหรับ Video Mode
│   └── utils/
│       ├── formatters.ts      # แปลงหน่วยเวลา และวาด Progress Bar
│       └── logger.ts          # แสดงผล Log สวยงามพร้อมสีสัน
└── tests/
    ├── utils.test.ts          # Unit test ฟังก์ชัน Utility และ Progress Bar
    └── database.test.ts       # Unit test ระบบ SQLite Playlist Repository
```

---

## 🚀 วิธีติดตั้งและรันใช้งาน (Installation & Setup)

### ขั้นตอนที่ 1: ติดตั้ง Dependencies
```bash
bun install
```

### ขั้นตอนที่ 2: ตั้งค่า `.env`
คัดลอกไฟล์ `.env.example` เป็น `.env`:
```bash
cp .env.example .env
```
เปิดแก้ไข `.env` แล้วระบุข้อมูลของคุณ:
```env
DISCORD_TOKEN=โทเคนบอทของคุณ
DISCORD_CLIENT_ID=ไอดีแอปพลิเคชันบอทของคุณ
LAVALINK_HOST=localhost
LAVALINK_PORT=2639
LAVALINK_PASSWORD=halflife3isnotreal
```

### ขั้นตอนที่ 3: ลงทะเบียน Slash Commands (`/fm`)
```bash
bun run deploy
```

### ขั้นตอนที่ 4: รัน Lavalink v4 และ Bot ภายในเครื่อง
1. รัน Lavalink v4 (เครื่องยนต์เสียง):
```bash
cd lavalink-server && java -jar Lavalink.jar
```
2. รันบอท Focalors Music:
```bash
bun run start
```
*(สำหรับการพัฒนา สามารถใช้ `bun run dev` เพื่อ Auto-reload เมื่อแก้ไขโค้ด)*

---

## 🐧 การติดตั้งบน Ubuntu Server (One-Click Setup & CLI Control)

บนเครื่อง Ubuntu Server (22.04 หรือ 24.04 LTS):
```bash
sudo bash scripts/setup-ubuntu.sh
```
สคริปต์จะทำการติดตั้ง Java 21, FFmpeg, Bun, ดาวน์โหลด Lavalink.jar และสร้าง Systemd Service รวมถึงตั้งค่าคำสั่ง CLI กลางให้อัตโนมัติ!

### 🖥️ Focalors CLI — เครื่องมือควบคุมและมอนิเตอร์บอทผ่าน Terminal

คุณสามารถพิมพ์คำสั่ง `focalors <command>` (หรือ `bun run cli <command>`) เพื่อควบคุมระบบได้ทันที:

| คำสั่ง CLI | คำอธิบาย |
|---|---|
| `focalors status` | ตรวจสอบสถานะภาพรวมทั้งหมด: Service, Lavalink CPU/RAM/Uptime, สถิติ SQLite |
| `focalors monitor` | เปิดหน้าต่าง Terminal Dashboard สด รีเฟรชแบบเรียลไทม์ทุก 2 วินาที |
| `focalors start` | เริ่มการทำงานของบอทและ Lavalink (ทำงานเบื้องหลัง) |
| `focalors stop` | สั่งหยุดการทำงานของบอทและ Lavalink |
| `focalors restart` | รีสตาร์ทบอทและ Lavalink |
| `focalors logs bot` | ดู Log การทำงานของบอทแบบสดๆ (Live stream) |
| `focalors logs lavalink` | ดู Log การทำงานของ Lavalink แบบสดๆ |
| `focalors db list` | ดูรายการ Playlist ทั้งหมดที่ถูกบันทึกไว้ใน SQLite |
| `focalors deploy` | ลงทะเบียนคำสั่ง Slash Command `/fm` กับ Discord ใหม่ |

---

## 🧪 การทดสอบระบบ (Automated Tests)
สามารถรัน Unit Tests ทั้งหมดได้ผ่าน Bun:
```bash
bun test
```

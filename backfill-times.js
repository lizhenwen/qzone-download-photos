const fs = require("fs");
const path = require("path");
const { exiftool } = require("exiftool-vendored");

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp"]);
const VIDEO_EXTENSIONS = new Set([".mp4"]);

// 下载时的文件名：2017-12-04_15-13-13_大小_id.ext，时间是北京时间。
const NAME_TIME = /^(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})_/;

function isRealShootTime(value) {
  if (value == null || value === "") return false;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return false;
    const year = value.getFullYear();
    return year >= 1980 && year <= 2100;
  }

  let year;
  let month;
  let day;
  let hour = 0;
  let minute = 0;
  let second = 0;
  if (typeof value.year === "number") {
    year = value.year;
    month = value.month;
    day = value.day;
    hour = value.hour ?? 0;
    minute = value.minute ?? 0;
    second = value.second ?? 0;
  } else {
    const text = String(value.rawValue || value).trim();
    const match = text.match(
      /^(\d{4})[-:](\d{2})[-:](\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/
    );
    if (!match) return false;
    year = Number(match[1]);
    month = Number(match[2]);
    day = Number(match[3]);
    hour = Number(match[4] ?? 0);
    minute = Number(match[5] ?? 0);
    second = Number(match[6] ?? 0);
  }
  if (year < 1980 || year > 2100) return false;
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  if (hour > 23 || minute > 59 || second > 59) return false;
  return true;
}

function shootFromName(filePath) {
  const match = path.basename(filePath).match(NAME_TIME);
  if (!match || !isRealShootTime(`${match[1]}-${match[2]}-${match[3]} ${match[4]}:${match[5]}:${match[6]}`)) {
    return null;
  }
  const local = `${match[1]}:${match[2]}:${match[3]} ${match[4]}:${match[5]}:${match[6]}`;
  return { local, quickTime: `${local}+08:00` };
}

function hasEmbeddedShootTime(tags) {
  if (!tags) return false;
  return [
    tags.DateTimeOriginal,
    tags.CreationDate,
    tags.CreateDate,
    tags.MediaCreateDate,
  ].some((value) => isRealShootTime(value));
}

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else files.push(full);
  }
  return files;
}

async function readTags(filePath) {
  try {
    return await exiftool.read(filePath);
  } catch (error) {
    console.error(`读取拍摄时间失败：${filePath} ${error.message || error}`);
    return null;
  }
}

async function writePhotoTime(filePath, local) {
  const existing = await readTags(filePath);
  const tags = {};
  if (!isRealShootTime(existing && existing.DateTimeOriginal)) {
    tags.DateTimeOriginal = local;
  }
  if (existing?.CreateDate != null && !isRealShootTime(existing.CreateDate)) {
    tags.CreateDate = local;
  }
  if (existing?.ModifyDate != null && !isRealShootTime(existing.ModifyDate)) {
    tags.ModifyDate = local;
  }
  if (!Object.keys(tags).length) return false;

  await exiftool.write(filePath, tags, {
    writeArgs: ["-overwrite_original", "-charset", "utf8"],
  });
  console.log(`写入照片拍摄时间：${filePath}`);
  return true;
}

async function writeVideoTime(filePath, quickTime) {
  const existing = await readTags(filePath);
  if (hasEmbeddedShootTime(existing)) return false;

  await exiftool.write(
    filePath,
    {
      CreateDate: quickTime,
      ModifyDate: quickTime,
      TrackCreateDate: quickTime,
      TrackModifyDate: quickTime,
      MediaCreateDate: quickTime,
      MediaModifyDate: quickTime,
      "QuickTime:CreationDate": quickTime,
    },
    {
      writeArgs: [
        "-overwrite_original",
        "-api",
        "QuickTimeUTC",
        "-charset",
        "utf8",
      ],
    }
  );
  console.log(`写入视频拍摄时间：${filePath}`);
  return true;
}

async function main() {
  const root = path.resolve(process.argv[2] || path.join(__dirname, "export"));
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    console.error(`目录不存在：${root}`);
    process.exitCode = 1;
    return;
  }

  const files = walk(root).filter((filePath) => {
    const ext = path.extname(filePath).toLowerCase();
    return IMAGE_EXTENSIONS.has(ext) || VIDEO_EXTENSIONS.has(ext);
  });
  console.log(`目录：${root}`);
  console.log(`待处理 ${files.length} 个文件`);

  const stats = { photo: 0, video: 0, skip: 0, fail: 0 };

  for (let i = 0; i < files.length; i++) {
    const filePath = files[i];
    const shoot = shootFromName(filePath);
    if (!shoot) {
      stats.skip += 1;
      console.log(`文件名里没有拍摄时间，跳过：${filePath}`);
    } else {
      try {
        const ext = path.extname(filePath).toLowerCase();
        if (VIDEO_EXTENSIONS.has(ext)) {
          if (await writeVideoTime(filePath, shoot.quickTime)) stats.video += 1;
        } else if (await writePhotoTime(filePath, shoot.local)) {
          stats.photo += 1;
        }
      } catch (error) {
        stats.fail += 1;
        console.error(
          `处理失败：${filePath} ${String(error?.message || error).split("\n")[0]}`
        );
      }
    }

    if ((i + 1) % 100 === 0 || i === files.length - 1) {
      console.log(`进度 ${i + 1}/${files.length}`);
    }
  }

  console.log(
    `完成。照片写入 ${stats.photo} 张，视频写入 ${stats.video} 个，跳过 ${stats.skip} 个，失败 ${stats.fail} 个。`
  );
  if (stats.fail > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => exiftool.end());

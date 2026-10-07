const fs = require("fs");
const path = require("path");
const { exiftool } = require("exiftool-vendored");

const MEDIA_EXTENSIONS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".webp",
  ".mp4",
]);

// 下载时的文件名：2017-12-04_15-13-13_大小_id.ext，时间是北京时间。
const NAME_TIME =
  /^(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})_/;

function shootFromName(filePath) {
  const match = path.basename(filePath).match(NAME_TIME);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  if (year < 1980 || year > 2100) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  if (hour > 23 || minute > 59 || second > 59) return null;

  const tag = `${match[1]}:${match[2]}:${match[3]} ${match[4]}:${match[5]}:${match[6]}+08:00`;
  const ms = Date.parse(
    `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}+08:00`
  );
  if (Number.isNaN(ms)) return null;
  return { tag, ms };
}

function videoDateYear(value) {
  if (value == null || value === "") return null;
  if (typeof value.year === "number") return value.year;
  const match = String(value.rawValue || value).match(/(\d{4})/);
  if (!match) return null;
  const year = Number(match[1]);
  return Number.isFinite(year) ? year : null;
}

function hasVideoShootTime(tags) {
  if (!tags) return false;
  return [
    tags.CreationDate,
    tags.CreateDate,
    tags.MediaCreateDate,
    tags.DateTimeOriginal,
  ].some((value) => {
    const year = videoDateYear(value);
    return year != null && year >= 1980 && year <= 2100;
  });
}

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else files.push(full);
  }
  return files;
}

async function writeVideoTime(filePath, tag) {
  let existing = null;
  try {
    existing = await exiftool.read(filePath);
  } catch (error) {
    console.error(`读取视频时间失败：${filePath} ${error.message || error}`);
  }
  if (hasVideoShootTime(existing)) return false;

  await exiftool.write(
    filePath,
    {
      CreateDate: tag,
      ModifyDate: tag,
      TrackCreateDate: tag,
      TrackModifyDate: tag,
      MediaCreateDate: tag,
      MediaModifyDate: tag,
      "QuickTime:CreationDate": tag,
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

async function setFileCreateTime(filePath, tag, ms) {
  try {
    const birthtimeMs = fs.statSync(filePath).birthtimeMs;
    if (Math.abs(birthtimeMs - ms) < 1000) return false;
  } catch (error) {
    console.error(`读取文件创建时间失败：${filePath} ${error.message || error}`);
  }

  await exiftool.write(
    filePath,
    { FileCreateDate: tag },
    { writeArgs: ["-overwrite_original", "-charset", "utf8"] }
  );
  console.log(`写入文件创建时间：${filePath}`);
  return true;
}

async function main() {
  const root = path.resolve(process.argv[2] || path.join(__dirname, "export"));
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    console.error(`目录不存在：${root}`);
    process.exitCode = 1;
    return;
  }

  const files = walk(root).filter((filePath) =>
    MEDIA_EXTENSIONS.has(path.extname(filePath).toLowerCase())
  );
  console.log(`目录：${root}`);
  console.log(`待处理 ${files.length} 个文件`);

  const stats = {
    video: 0,
    create: 0,
    skip: 0,
    fail: 0,
  };

  for (let i = 0; i < files.length; i++) {
    const filePath = files[i];
    const shoot = shootFromName(filePath);
    if (!shoot) {
      stats.skip += 1;
      console.log(`文件名里没有拍摄时间，跳过：${filePath}`);
      continue;
    }

    try {
      if (path.extname(filePath).toLowerCase() === ".mp4") {
        if (await writeVideoTime(filePath, shoot.tag)) stats.video += 1;
      }
      if (await setFileCreateTime(filePath, shoot.tag, shoot.ms)) stats.create += 1;
    } catch (error) {
      stats.fail += 1;
      console.error(
        `处理失败：${filePath} ${String(error?.message || error).split("\n")[0]}`
      );
    }

    if ((i + 1) % 100 === 0 || i === files.length - 1) {
      console.log(`进度 ${i + 1}/${files.length}`);
    }
  }

  console.log(
    `完成。视频写入 ${stats.video} 个，创建时间写入 ${stats.create} 个，跳过 ${stats.skip} 个，失败 ${stats.fail} 个。`
  );
  if (stats.fail > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => exiftool.end());

const axios = require("axios");
const fs = require("fs");
const path = require("path");
const exifr = require("exifr");
const { exiftool } = require("exiftool-vendored");

//是否忽略本地存在的照片
const IgnoreExistingPhotos = true;

//在控制台运行  alert(document.cookie)
//然后把内容粘贴到 COOKIE 变量下
let COOKIE;
const exportDir = path.join(__dirname,"./export/");
if (!fs.existsSync(exportDir)) {
  fs.mkdirSync(exportDir, { recursive: true });
  console.log(`创建目录：${exportDir}`);
}

const downloadFilePath = path.join(exportDir,"./photo_data.json");

const Tools = {
  getACSRFToken(cookieStr) {
    var str = Tools.getCookie(cookieStr, "p_skey");
    var hash = 5381;

    for (var i = 0, len = str.length; i < len; ++i) {
      hash += (hash << 5) + str.charCodeAt(i);
    }

    return hash & 0x7fffffff;
  },
  getCookie(cookieStr, key) {
    const cookiesArray = cookieStr.split(";");

    for (let i = 0; i < cookiesArray.length; i++) {
      let keyValue = cookiesArray[i].trim();

      if (keyValue.indexOf(key) === -1) continue;

      return decodeURIComponent(keyValue.substring(keyValue.indexOf("=") + 1));
    }

    // 如果找不到key，返回null
    return null;
  },
  sleep(ms) {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  },
  formatExifTime(input) {
    input = (input || "").trim();
    const dateRegex1 = /(\d{4}):(\d{2}):(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/;
    const dateRegex2 = /(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/;
    let match;
    if ((match = input.match(dateRegex1))) {
      return input;
    } else if ((match = input.match(dateRegex2))) {
      return `${match[1]}:${match[2]}:${match[3]} ${match[4]}:${match[5]}:${match[6]}`;
    } else {
      return null;
    }
  },
  // QQ 空间时间是北京时间。抓包里的 timeRange 用的是这段时间的 Unix 秒。
  qqTimeToUnix(input) {
    const text = String(input || "").trim();
    const match = text.match(
      /^(\d{4})[-:](\d{2})[-:](\d{2})\s+(\d{2}):(\d{2}):(\d{2})/
    );
    if (!match) return null;
    const ms = Date.parse(
      `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}+08:00`
    );
    if (Number.isNaN(ms)) return null;
    return Math.floor(ms / 1000);
  },
  // poiX 是经度，poiY 是纬度。个别点会放大 100 万倍，例如 102893112。
  normalizeAxis(value, limit) {
    let n = parseFloat(value);
    if (!Number.isFinite(n)) return null;
    if (Math.abs(n) > limit) n = n / 1e6;
    if (Math.abs(n) > limit) return null;
    return n;
  },
  parseQzoneBody(payload) {
    if (payload && typeof payload === "object") return payload;
    if (typeof payload !== "string") return null;
    const text = payload.trim().replace(/^\uFEFF/, "");
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch (error) {
      console.error("解析照片列表响应失败", error.message);
      return null;
    }
  },
  photoKey(photo) {
    return photo?.lloc || photo?.sloc || photo?.origin_uuid || "";
  },
  placeText(poi) {
    if (!poi) return "";
    return [poi.name, poi.city, poi.desc]
      .map((item) => String(item || "").trim())
      .filter(Boolean)
      .join(" / ");
  },
};

const Photos = {
  async getAlbumList() {
    const url =
      "https://user.qzone.qq.com/proxy/domain/photo.qzone.qq.com/fcgi-bin/fcg_list_album_v3?t=544565479&appid=4&inCharset=utf-8&outCharset=utf-8&source=qzone&plat=qzone&format=json&notice=0&filter=1&handset=4&pageNumModeSort=40&pageNumModeClass=15&needUserInfo=1&idcNum=4&_=" +
      new Date().getTime();

    let rs;

    try {
      const resp = await axios.get(url, {
        params: {
          g_tk: Tools.getACSRFToken(COOKIE),
          hostUin: Tools.getCookie(COOKIE, "ptui_loginuin"),
          uin: Tools.getCookie(COOKIE, "ptui_loginuin"),
        },
        headers: {
          cookie: COOKIE,
        },
      });

      rs = resp?.data?.data?.albumListModeSort;
      if (!rs) {
        console.log(resp?.data || resp);
        throw new Error("相册数据拉取失败");
      }
    } catch (error) {
      console.log(`getAlbumList axios error: `);

      console.error(error);
    }

    return rs;
  },
  async requestList(extra) {
    const uin = Tools.getCookie(COOKIE, "ptui_loginuin");
    const url =
      "https://user.qzone.qq.com/proxy/domain/photo.qzone.qq.com/fcgi-bin/cgi_list_photo";

    try {
      const resp = await axios.get(url, {
        params: {
          g_tk: Tools.getACSRFToken(COOKIE),
          t: Math.floor(Math.random() * 1e9),
          hostUin: uin,
          uin,
          idcNum: 4,
          notice: 0,
          source: "qzone",
          plat: "qzone",
          format: "json",
          appid: 4,
          inCharset: "utf-8",
          outCharset: "utf-8",
          sortOrder: 6,
          ...extra,
        },
        headers: {
          cookie: COOKIE,
          Referer: `https://user.qzone.qq.com/${uin}`,
        },
        responseType: "text",
        transformResponse: [(data) => data],
      });

      const body = Tools.parseQzoneBody(resp.data);
      if (!body || Number(body.code) !== 0 || !body.data) {
        console.error(
          "照片列表接口异常",
          body && body.code,
          body && body.message
        );
        return null;
      }
      return body.data;
    } catch (error) {
      console.log("requestList axios error: ");
      console.error(error);
      return null;
    }
  },
  poiFromSegment(seg) {
    const lng = Tools.normalizeAxis(seg && seg.poiX, 180);
    const lat = Tools.normalizeAxis(seg && seg.poiY, 90);
    const valid =
      lng != null && lat != null && !(lng === 0 && lat === 0);
    const clean = (value) => String(value || "").trim();
    return {
      poiId: (seg && seg.poiId) || "",
      lng: valid ? lng : null,
      lat: valid ? lat : null,
      name: clean(seg && seg.scencename),
      city: clean(seg && seg.scenceCityName),
      desc: clean(seg && seg.scenceDesc),
    };
  },
  photoTimeUnix(photo) {
    return (
      Tools.qqTimeToUnix(photo?.exif?.originalTime) ||
      Tools.qqTimeToUnix(photo?.rawshoottime) ||
      Tools.qqTimeToUnix(photo?.uploadtime)
    );
  },
  matchPoi(photo, segments) {
    const time = this.photoTimeUnix(photo);
    if (time == null) return null;
    for (const seg of segments) {
      if (time >= seg.start && time <= seg.end) return seg.poi;
    }
    return null;
  },
  // 旅行相册第二次请求：mode=3，按 begintime/endtime 的 timeRange 拉这一段的全部照片。
  async listTimeRange(topicId, start, end) {
    const timeRange = `${start}_${end}`;
    const pageNum = 500;
    const all = [];
    const seen = new Set();
    let pageStart = 0;

    while (pageStart < 200000) {
      const data = await this.requestList({
        topicId,
        mode: 3,
        pageNum,
        pageStart,
        noTopic: 1,
        timeRange,
      });
      const range = data?.rangeList?.[0];
      const page = range?.photoList || [];
      if (!page.length) break;

      let added = 0;
      for (const photo of page) {
        const key = Tools.photoKey(photo);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        all.push(photo);
        added++;
      }

      const total = Number(range?.totalInRange) || 0;
      if (added === 0) break;
      if (total && all.length >= total) break;
      if (page.length < pageNum) break;
      pageStart += page.length;
      await Tools.sleep(200);
    }

    return all;
  },
  async getPhotoList(albumInfo) {
    const topicId = albumInfo.id;
    const first = await this.requestList({
      topicId,
      mode: 2,
      pageNum: 50,
      pageStart: 0,
      noTopic: 0,
    });
    if (!first) return [];

    const total = Number(first.topic?.total) || 0;
    const timeline = Array.isArray(first.travelTimeLine)
      ? first.travelTimeLine
      : [];
    const map = new Map();
    const addPhotos = (list, poi) => {
      let added = 0;
      for (const photo of list || []) {
        const key = Tools.photoKey(photo);
        if (!key) continue;
        const prev = map.get(key);
        if (!prev) {
          if (poi) photo.poi = poi;
          map.set(key, photo);
          added++;
        } else if (poi && !prev.poi) {
          prev.poi = poi;
        }
      }
      return added;
    };

    const segments = [];
    if (timeline.length) {
      console.log(
        `相册「${albumInfo.name}」按旅行时间线拉取，接口总数 ${
          total || "未知"
        }，时间段 ${timeline.length}`
      );
      for (const seg of timeline) {
        const start = Tools.qqTimeToUnix(seg.begintime);
        const end = Tools.qqTimeToUnix(seg.endtime);
        const poi = this.poiFromSegment(seg);
        const label =
          String(seg.scencename || seg.begintime || "").trim() || "未命名时段";
        if (start == null || end == null) {
          console.error(
            `  跳过无法解析的时间段：${seg.begintime} ~ ${seg.endtime}`
          );
          continue;
        }
        segments.push({ poi, start, end });
        const rangePhotos = await this.listTimeRange(topicId, start, end);
        addPhotos(rangePhotos, poi);
        const expect = Number(seg.num) || 0;
        console.log(
          `  ${label}：${rangePhotos.length}${expect ? "/" + expect : ""}`
        );
        await Tools.sleep(200);
      }
    }

    // 首屏照片也并进来。分段请求若漏掉，仍按拍摄时间挂上对应地点。
    addPhotos(first.photoList);
    for (const photo of map.values()) {
      if (photo.poi) continue;
      const poi = this.matchPoi(photo, segments);
      if (poi) photo.poi = poi;
    }

    if (!timeline.length || (total && map.size < total)) {
      if (timeline.length) {
        console.log(`时间线覆盖 ${map.size}/${total}，继续翻页补齐`);
      }
      const fill = async (mode, pageNum) => {
        let pageStart = 0;
        while (pageStart < 200000 && (!total || map.size < total)) {
          const data = await this.requestList({
            topicId,
            mode,
            pageNum,
            pageStart,
            noTopic: 0,
          });
          const page = data?.photoList || [];
          if (!page.length) break;
          let added = 0;
          for (const photo of page) {
            const key = Tools.photoKey(photo);
            if (!key || map.has(key)) continue;
            const poi = this.matchPoi(photo, segments);
            if (poi) photo.poi = poi;
            map.set(key, photo);
            added++;
          }
          if (added === 0) break;
          pageStart += page.length;
          if (page.length < pageNum) break;
          await Tools.sleep(200);
        }
      };

      await fill(2, 100);
      if (!total || map.size < total) {
        await fill(0, 500);
      }
    }

    if (Array.isArray(first.unknownList)) {
      for (const photo of first.unknownList) {
        const key = Tools.photoKey(photo);
        if (!key || map.has(key)) continue;
        const poi = this.matchPoi(photo, segments);
        if (poi) photo.poi = poi;
        map.set(key, photo);
      }
    }

    const photos = [...map.values()];
    const withGps = photos.filter((photo) => photo.poi && photo.poi.lat != null)
      .length;
    console.log(
      `相册「${albumInfo.name}」拉取 ${photos.length} 张${
        total ? " / 接口总数 " + total : ""
      }，可写坐标 ${withGps} 张`
    );
    return photos;
  },
  async getVideoUrl(albumInfo, photoInfo) {
    let url =
      "https://user.qzone.qq.com/proxy/domain/photo.qzone.qq.com/fcgi-bin/cgi_floatview_photo_list_v2?t=788063534&shootTime=&cmtOrder=1&fupdate=1&plat=qzone&source=qzone&cmtNum=10&likeNum=5&inCharset=utf-8&outCharset=utf-8&callbackFun=viewer&offset=0&number=15&appid=4&isFirst=1&sortOrder=5&showMode=1&need_private_comment=1&prevNum=9&postNum=18&format=json&json_esc=1&_=" +
      new Date().getTime();

    let topicId = albumInfo.id;
    let picKey = photoInfo.lloc;

    let rs;

    try {
      const resp = await axios.get(url, {
        params: {
          g_tk: Tools.getACSRFToken(COOKIE),
          hostUin: Tools.getCookie(COOKIE, "ptui_loginuin"),
          uin: Tools.getCookie(COOKIE, "ptui_loginuin"),
          picKey,
          topicId,
          pageStart: 0,
          pageNum: 1000000,
        },
        headers: {
          cookie: COOKIE,
        },
      });

      let resData = resp?.data?.data?.photos;
      if (resData && resData.length > 0) {
        resData.forEach((ele) => {
          let { lloc } = ele;
          if (lloc === picKey) {
            rs = (
              ele?.video_info?.download_url ||
              ele?.video_info?.video_url ||
              ""
            ).trim();
          }
        });
      } else {
        console.error("getVideoUrl 未拉取到照片数据");
      }
    } catch (error) {
      console.log(`getVideoUrl axios error: `);

      console.error(error);
    }

    return rs;
  },
  parsePhotoName(photoInfo) {
    //使用时间来命名
    let date = photoInfo.rawshoottime || photoInfo.uploadtime;
    const dateObj = new Date(date);
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, "0");
    const day = String(dateObj.getDate()).padStart(2, "0");
    const hours = String(dateObj.getHours()).padStart(2, "0");
    const minutes = String(dateObj.getMinutes()).padStart(2, "0");
    const seconds = String(dateObj.getSeconds()).padStart(2, "0");
    const fileName = `${year}-${month}-${day}_${hours}-${minutes}-${seconds}_${photoInfo.photocubage}`;

    return fileName.trim();
  },
};

async function downloadData() {
  console.log("开始下载照片数据.....");
  let data = [];

  let albums = await Photos.getAlbumList();
  if (!albums) {
    console.error("***拉取相册数据失败***");
    
    return 
  }
  for (let album of albums) {
    let photos = await Photos.getPhotoList(album);
    data.push({
      name: album.name,
      id: album.id,
      photos,
    });
  }
  fs.writeFileSync(downloadFilePath, JSON.stringify(data, null, 2));
  console.log(`已将照片数据保存到 ${downloadFilePath}`);

  return data;
}

async function writePhotoExif(savePath, photoInfo) {
  let exifData = null;
  try {
    exifData = await exifr.parse(savePath);
  } catch (error) {
    console.error(`读取 Exif 失败：${savePath}`, error.message || error);
  }

  const tags = {};
  if (!exifData || !exifData.DateTimeOriginal) {
    const dateTimeOriginal = Tools.formatExifTime(
      photoInfo?.exif?.originalTime ||
        photoInfo.rawshoottime ||
        photoInfo.uploadtime
    );
    if (dateTimeOriginal) tags.DateTimeOriginal = dateTimeOriginal;
  }

  const poi = photoInfo.poi;
  const hasGps =
    exifData &&
    (Number.isFinite(exifData.latitude) || Number.isFinite(exifData.longitude));
  if (!hasGps && poi && Number.isFinite(poi.lat) && Number.isFinite(poi.lng)) {
    tags.GPSLatitude = Math.abs(poi.lat);
    tags.GPSLatitudeRef = poi.lat >= 0 ? "N" : "S";
    tags.GPSLongitude = Math.abs(poi.lng);
    tags.GPSLongitudeRef = poi.lng >= 0 ? "E" : "W";
  }

  // 时间线地点优先；name/city/desc 都空时，用照片自带的 poiName。
  const place =
    Tools.placeText(poi) || String(photoInfo.poiName || "").trim();
  const comment = exifData && (exifData.UserComment || exifData.XPComment);
  if (place && !String(comment || "").trim()) {
    tags.UserComment = place;
    tags.XPComment = place;
  }

  if (!Object.keys(tags).length) return;

  try {
    await exiftool.write(savePath, tags, {
      writeArgs: ["-overwrite_original", "-charset", "utf8"],
    });
    const parts = [];
    if (tags.DateTimeOriginal) parts.push("拍摄时间");
    if (tags.GPSLatitude != null) parts.push("坐标");
    if (tags.UserComment) parts.push("地名");
    console.log(`写入 Exif（${parts.join("、")}）：${savePath}`);
  } catch (err) {
    console.error(`写入 Exif 失败：${savePath}`, err);
  }
}

async function downloadFile(photoInfo, albumInfo) {
  let fileUrl = photoInfo.raw || photoInfo.url;
  if (photoInfo.is_video) {
    fileUrl = await Photos.getVideoUrl(albumInfo, photoInfo);
  }

  if (!fileUrl) {
    console.error(`未获取到下载链接，photo.lloc=${photoInfo.lloc}, album.id=${albumInfo.id}`);
    return 
  }

  const albumName = albumInfo.name;
  const photoName = Photos.parsePhotoName(photoInfo)+(photoInfo.is_video?".mp4":".jpg");
  
  const savedFolderPath = path.join(exportDir, albumName);
  if (!fs.existsSync(savedFolderPath)) fs.mkdirSync(savedFolderPath, { recursive: true });

  const savePath = path.join(savedFolderPath, photoName);

  //本地已有文件不再下载，但仍补上缺失的拍摄时间和地理位置。
  if (IgnoreExistingPhotos && fs.existsSync(savePath)) {
    if (!photoInfo.is_video) await writePhotoExif(savePath, photoInfo);
    console.log(`本地文件已存在，跳过下载：${savePath}`);
    return;
  }

  try {
    // 下载图片到本地
    const response = await axios({
      url: fileUrl,
      responseType: "arraybuffer",
    });

    fs.writeFileSync(savePath, Buffer.from(response.data));
    console.log(`下载成功：${savePath}`);

    await Tools.sleep(300);

    if (!photoInfo.is_video) await writePhotoExif(savePath, photoInfo);
  } catch (error) {
    console.error("downloadFile出现错误：", error);
  }
}

async function start() {
  try {
    //初始化 cookie
    COOKIE = (fs.readFileSync("./cookie.txt", "utf8") || "").trim();
    if (!COOKIE) {
      console.error(
        "-----------------------WARNING-----------------------------\n"
      );
      console.error(
        "请登录 qzone.qq.com，然后将 cookie 复制到 cookie.txt 文件内。"
      );
      console.error(
        "\n------------------------------------------------------------"
      );
      return;
    }

    let data = await downloadData();
    // let data = JSON.parse(fs.readFileSync(downloadFilePath));

    for (let i = 0; i < data.length; i++) {
      let album = data[i];

      let photosData = album.photos;
      if (photosData && photosData.length > 0) {
        for (let j = 0; j < photosData.length; j++) {
          let photoInfo = photosData[j];
          await downloadFile(photoInfo, album);
        }
      } else {
        console.log(`相册 ${album.name} 没有照片，跳过。`);
      }
    }
  } finally {
    await exiftool.end();
  }
}

start();
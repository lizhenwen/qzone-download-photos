# qzone-download-photos

## 功能
下载 qzone 照片，同时会把拍照时间/上传时间写入EXIF

## 前置安装

如果需要写入 exif，请先安装`exiftool`：

windows 直接去官网下载： https://exiftool.org/

mac 执行`brew install exiftool`

## 使用

1. 将仓库 `git clone` 到本地

2. 登录QQ空间，然后F12 打开控制台，执行`alert(document.cookie)` ，将文本内容复制粘贴到 `./cookie.txt` 里面

3. 进入仓库目录，执行：
```
# 安装依赖
npm install

# 执行下载
npm run start
```

4. 图片会下载到 `./export` 目录
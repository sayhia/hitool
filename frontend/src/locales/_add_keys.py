import json
from collections import OrderedDict

zh_add = {
    "tools": {
        "video-screenshot": {"name": "视频截帧", "desc": "按时间点或等间隔截取视频画面"},
        "video-gif": {"name": "视频转 GIF", "desc": "截取视频片段转换为动图"},
        "date-calc": {"name": "日期计算器", "desc": "日期差值与日期推算，支持工作日"},
        "json-csv": {"name": "JSON ⇄ CSV", "desc": "对象数组与 CSV 互转，嵌套键扁平为点路径"},
    },
    "shot": {
        "mode": "截帧方式",
        "modeTime": "指定时间点",
        "modeEven": "等间隔分布",
        "time": "时间点（秒）",
        "timeHint": "距视频开头的秒数",
        "count": "帧数",
        "countHint": "在整个视频中均匀分布，最多 60 帧",
    },
    "gif": {
        "start": "起始时间（秒）",
        "duration": "时长（秒）",
        "durationHint": "片段越长，文件越大",
        "fps": "帧率",
        "width": "宽度（像素）",
        "widthHint": "高度按比例自动缩放",
    },
    "date": {
        "diffTitle": "日期差值",
        "offsetTitle": "日期推算",
        "from": "开始日期",
        "to": "结束日期",
        "swap": "交换",
        "days": "天",
        "weeks": "周",
        "workdays": "工作日",
        "months": "月 + 天",
        "monthUnit": "个月",
        "dayUnit": "天",
        "base": "基准日期",
        "amount": "数量",
        "badDate": "日期无效，请检查输入",
        "offsetHint": "按月推算时，目标月没有对应日期则落在月末（如 1 月 31 日 + 1 个月 = 2 月 28/29 日）。",
    },
    "jcsv": {
        "swap": "交换",
        "jsonPh": "粘贴 JSON 数组，如 [{\"name\": \"Ada\", \"age\": 36}]",
        "csvPh": "粘贴 CSV 文本，首行为表头",
        "idle": "填入内容后自动转换",
        "options": "选项",
        "delimiter": "分隔符",
        "auto": "自动",
        "nestHint": "嵌套对象会扁平为点路径列（user.city），转回 JSON 时恢复嵌套。",
        "noColumns": "找不到可用的列",
        "noRows": "未解析到数据行",
    },
}

en_add = {
    "tools": {
        "video-screenshot": {"name": "Video Frames", "desc": "Grab stills at a time point or at even intervals"},
        "video-gif": {"name": "Video to GIF", "desc": "Turn a clip into an animated GIF"},
        "date-calc": {"name": "Date Calculator", "desc": "Date difference and projection, with working days"},
        "json-csv": {"name": "JSON ⇄ CSV", "desc": "Records to CSV and back; nested keys flatten to dot paths"},
    },
    "shot": {
        "mode": "Capture mode",
        "modeTime": "Time point",
        "modeEven": "Even spread",
        "time": "Time (s)",
        "timeHint": "Seconds from the start of the video",
        "count": "Frames",
        "countHint": "Spread evenly across the whole video, up to 60",
    },
    "gif": {
        "start": "Start (s)",
        "duration": "Duration (s)",
        "durationHint": "Longer clips make bigger files",
        "fps": "Frame rate",
        "width": "Width (px)",
        "widthHint": "Height scales to keep the aspect ratio",
    },
    "date": {
        "diffTitle": "Date difference",
        "offsetTitle": "Date projection",
        "from": "From",
        "to": "To",
        "swap": "Swap",
        "days": "Days",
        "weeks": "Weeks",
        "workdays": "Working days",
        "months": "Months + days",
        "monthUnit": "mo",
        "dayUnit": "d",
        "base": "Base date",
        "amount": "Amount",
        "badDate": "Invalid date — check the input",
        "offsetHint": "Adding months lands on the month's last day when the day doesn't exist (Jan 31 + 1 mo → Feb 28/29).",
    },
    "jcsv": {
        "swap": "Swap",
        "jsonPh": "Paste a JSON array, e.g. [{\"name\": \"Ada\", \"age\": 36}]",
        "csvPh": "Paste CSV text — the first row is the header",
        "idle": "Paste something to convert",
        "options": "Options",
        "delimiter": "Delimiter",
        "auto": "Auto",
        "nestHint": "Nested objects flatten into dot-path columns (user.city); converting back restores the nesting.",
        "noColumns": "No usable columns found",
        "noRows": "No data rows parsed",
    },
}

for path, add in [("zh.json", zh_add), ("en.json", en_add)]:
    with open(path, encoding="utf-8") as f:
        data = json.load(f, object_pairs_hook=OrderedDict)
    for ns, entries in add.items():
        data.setdefault(ns, OrderedDict())
        for k, v in entries.items():
            data[ns][k] = v
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(path, "done, tools:", len(data["tools"]))

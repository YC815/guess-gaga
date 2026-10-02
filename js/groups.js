// 「猜歌手」模式的歌單。四個選項都從同一個歌單裡挑，
// 所以同一個歌單裡的歌手要聲線、曲風、年代相近，才不會一聽語言或曲風就猜得出來。
// 女聲、男聲、樂團分開放；灣聲樂團是純器樂，不放進任何歌單。
// 只作曲、製作不主唱的人（Pritam、Sachin-Jigar、Metro Boomin）也不放，他們的歌是別的歌手唱的。
const GROUP_RANKS = ["耳朵是雷達吧？👂", "聽聲辨人高手 🎧", "還在暖耳朵 🎶", "先多聽幾首再來 📀"];

window.GROUPS = [
  {
    id: "mix",
    name: "大亂鬥",
    icon: "🎲",
    desc: "全部歌手隨機出題，語言曲風都不同，最適合暖身",
    colors: { accent: "#d58697", accent2: "#b9bddf", onAccent: "#291419" },
    artists: "*",
  },
  {
    id: "zh-diva",
    name: "華語天后",
    icon: "👑",
    desc: "全是華語女聲，要聽得出誰是誰",
    colors: { accent: "#d586a8", accent2: "#dfb9c9", onAccent: "#29141d" },
    artists: ["jolin", "amei", "hebe", "rainie", "cyndi", "angelachang", "she", "reneliu", "lala", "maggiechiang", "eveai", "naiwen", "cheerchen", "waawei", "deserts", "faye", "naying", "janezhang", "9m88", "stefanie", "fishleong", "tanya", "elva", "alin", "christinefan", "rachelliang", "clairekuo", "tigerhuang", "pennytai", "mavisfan", "tarcysu", "jesslee", "della", "kimberley", "juliawu", "zhangbichen", "shanyichun", "liyuchun", "tanweiwei", "bibizhou", "huangxiaoyun", "yisayu", "chenli", "wangjingwen", "hanhong", "fangdong"],
  },
  {
    id: "zh-male",
    name: "華語男聲",
    icon: "🎤",
    desc: "從情歌王子到創作才子，全是華語男歌手",
    colors: { accent: "#86d5cd", accent2: "#b9dfbf", onAccent: "#142927" },
    artists: ["jay", "yoga", "jamhsiao", "ericchou", "weibird", "davidtao", "wilberpan", "crowdlu", "hsiao", "wakin", "richiejen", "harlemyu", "ayue", "qingfeng", "ronghao", "joker", "zhoushen", "maobuyi", "huachenyu", "lijian", "pushu", "chyichin", "jonathanlee", "tomchang", "jjlin", "leehom", "showlo", "jeffchang", "bii", "terrylin", "philchang", "michaelwong", "victorwong", "samlee", "garychaw", "nickylee", "aska", "alienhuang", "aaronyan", "xiaobingchih", "ninechen", "fengze", "zhengxing", "leeyuting", "chihsiou", "rchord", "silence", "xusong", "jasonzhang", "roywang", "jacksonyee", "karrywang", "kun", "lay", "luhan", "liuyuning", "zhengrunze", "huxia", "zhangyuan", "laofan", "huangzihongfan", "jinzhiwen", "xuwei", "songdongye", "zhaolei", "daolang", "wangfeng", "tfboys", "tnt"],
  },
  {
    id: "tw-band",
    name: "台灣樂團",
    icon: "🥁",
    desc: "五月天、告五人、草東……主唱的聲音你分得出來嗎？",
    colors: { accent: "#86d5a5", accent2: "#d3dfb9", onAccent: "#14291c" },
    artists: ["mayday", "sodagreen", "accusefive", "831", "caodong", "sunsetrollercoaster", "mangojump", "cosmospeople", "powerstation", "mj116", "fireex", "amazingshow", "sorryyouth", "chairman", "eggplantegg", "chthonic", "mixer", "shazi", "papun", "bestards", "sweetjohn"],
  },
  {
    id: "zh-rap",
    name: "華語饒舌",
    icon: "🎙️",
    desc: "熱狗、蛋堡、瘦子、GAI……聽 flow 認人",
    colors: { accent: "#d59c86", accent2: "#b9c9df", onAccent: "#291a14" },
    artists: ["mchotdog", "softlipa", "eso", "shou", "osn", "gugu", "nickthereal", "mj116", "gai", "higherbrothers", "ayue", "wilberpan"],
  },
  {
    id: "twh-diva",
    name: "台語天后",
    icon: "🏮",
    desc: "江蕙、黃乙玲、龍千玉……台語女聲大集合",
    colors: { accent: "#d5ad86", accent2: "#dfd4b9", onAccent: "#291e14" },
    artists: ["jody", "jeannie", "huangyiling", "lungchienyu", "tsaichiufeng", "chanyawen", "huangfei", "tsenghsinmei", "chenyalan", "chenyingchieh", "wushenmei", "changhsiuching", "caoyawen", "xianghuiling", "chenxiaoyun", "jiangshuna", "wangruixia", "xiulanmaya", "leechienna", "enno"],
  },
  {
    id: "twh-male",
    name: "台語男聲",
    icon: "🍶",
    desc: "伍佰、陳雷、王識賢……台語男歌手大集合",
    colors: { accent: "#d5ab86", accent2: "#dfd2b9", onAccent: "#291e14" },
    artists: ["wubai", "chenlei", "yehchitien", "hungjunghung", "wangshihhsien", "wengliyu", "chiangchihfeng", "huangshanliang", "chengchinyi", "loshihfeng", "tsaihsiaohu", "chenmingchang", "limgiong", "911", "caotun", "linjunyi", "caijialin", "yutian", "huangxitian", "guojinfa", "hsufukai", "chensuiyi"],
  },
  {
    id: "classic",
    name: "經典老歌",
    icon: "📻",
    desc: "鄧麗君、費玉清、文夏……華語台語都有，爸媽的歌單",
    colors: { accent: "#d5ba86", accent2: "#dfd4b9", onAccent: "#292214" },
    artists: ["teresateng", "feiyuching", "jonathanlee", "chyichin", "tomchang", "wakin", "harlemyu", "richiejen", "wenhsia", "hungyifeng", "yehchitien", "jody", "faye", "naying", "lotayu", "tsaichin", "winniehsin", "wanfang", "tarcysu", "jeffchang", "guojinfa", "huangxitian", "cuijian"],
  },
  {
    id: "jpop",
    name: "J-POP",
    icon: "🌸",
    desc: "YOASOBI、米津玄師、Ado……日本流行樂",
    colors: { accent: "#d58697", accent2: "#dfb9c0", onAccent: "#291419" },
    artists: ["yoasobi", "yonezu", "mga", "higedan", "kinggnu", "ado", "aimyon", "backnumber", "utada", "vaundy", "lisa-jp", "hana", "milk", "chanmina", "snowman", "creepynuts", "tuki", "yuuri", "fujiikaze", "sekainoowari", "radwimps", "spitz", "milet", "zutomayo", "yorushika", "aimer", "bz", "arashi", "mrchildren", "southern", "dreamscometrue", "sheenaringo", "namie", "ayu", "perfume", "babymetal", "oneokrock", "bump", "ikimono", "nogizaka", "numberi", "atarashii", "hoshinogen", "saucydog", "imase", "ryokuoushoku", "befirst", "sakanaction", "tatsuro", "mariya"],
  },
  {
    id: "kpop",
    name: "K-POP",
    icon: "💜",
    desc: "BTS、BLACKPINK、TWICE……韓國流行樂",
    colors: { accent: "#9086d5", accent2: "#b9d8df", onAccent: "#171429" },
    artists: ["bts", "blackpink", "twice", "newjeans", "straykids", "psy", "iu", "ive", "akmu", "cortis", "ioi", "rescene", "aespa", "lesserafim", "seventeen", "idle", "illit", "babymonster", "day6", "bigbang", "gdragon", "rose", "jennie", "jisoo", "jimin", "jungkook", "txt", "enhypen", "nctdream", "exo", "redvelvet", "snsd", "mamamoo", "itzy", "kissoflife", "riize", "boynextdoor", "zb1", "ateez", "taeyeon", "qwer", "plave", "hearts2hearts", "meovv", "tws", "nmixx", "shinee", "superjunior", "2ne1", "limyoungwoong", "lisa"],
  },
  {
    id: "west-diva",
    name: "歐美天后",
    icon: "💃",
    desc: "從瑪丹娜到 Sabrina Carpenter，全是歐美女聲",
    colors: { accent: "#d586a7", accent2: "#cfb9df", onAccent: "#29141d" },
    artists: ["gaga", "ariana", "taylor", "billie", "adele", "dualipa", "beyonce", "olivia", "rihanna", "sza", "dojacat", "katyperry", "sabrina", "lanadelrey", "madonna", "whitney", "mariah", "britney", "aliciakeys", "sia", "selena", "miley", "pink", "celine", "ellalangley", "chappell", "gracie", "tatemcrae", "oliviadean", "laufey", "lizzo", "halsey", "lorde", "charlixcx", "avril", "aguilera", "janet", "tinaturner", "amywinehouse", "dolly", "spicegirls", "destinyschild", "katseye"],
  },
  {
    id: "west-male",
    name: "歐美男聲",
    icon: "🕺",
    desc: "從貓王、MJ 到 Bruno Mars，全是歐美男歌手",
    colors: { accent: "#8690d5", accent2: "#b9d8df", onAccent: "#141729" },
    artists: ["mj", "bruno", "edsheeran", "weeknd", "bieber", "harrystyles", "eltonjohn", "elvis", "prince", "steviewonder", "bowie", "timberlake", "usher", "shawnmendes", "charlieputh", "samsmith", "capaldi", "frankocean", "postmalone", "morganwallen", "bobmarley", "noahkahan", "zachbryan", "lukecombs", "shaboozey", "bensonboone", "teddyswims", "alexwarren", "hozier", "sombr", "conangray", "khalid", "jamesarthur", "stapleton", "bryanadams", "philcollins", "georgemichael", "billyjoel", "springsteen", "johnnycash", "sinatra", "jonasbrothers", "onedirection", "bsb", "nsync"],
  },
  {
    id: "hiphop",
    name: "嘻哈饒舌",
    icon: "🧢",
    desc: "Eminem、Drake、Kendrick……聽 flow 認人",
    colors: { accent: "#d5c186", accent2: "#dfc5b9", onAccent: "#292414" },
    artists: ["drake", "eminem", "kendrick", "travisscott", "future", "nickiminaj", "cardib", "jayz", "snoop", "fiftycent", "postmalone", "tyler", "carti", "21savage", "lilbaby", "lilnasx", "megan", "doechii", "jcole", "jackharlow", "juicewrld", "kidlaroi", "pitbull"],
  },
  {
    id: "rock",
    name: "搖滾樂團",
    icon: "🎸",
    desc: "從披頭四、Queen 到 Imagine Dragons",
    colors: { accent: "#d58c86", accent2: "#dfcdb9", onAccent: "#291614" },
    artists: ["coldplay", "imaginedragons", "maroon5", "linkinpark", "queen", "beatles", "nirvana", "metallica", "acdc", "gnr", "rhcp", "oasis", "radiohead", "u2", "bonjovi", "pinkfloyd", "ledzeppelin", "rollingstones", "fleetwoodmac", "eagles", "greenday", "twentyonepilots", "arcticmonkeys", "onerepublic", "abba", "killers", "foofighters", "paramore", "fob", "panic", "gorillaz", "the1975"],
  },
  {
    id: "edm",
    name: "電音派對",
    icon: "🎧",
    desc: "Avicii、Calvin Harris、Daft Punk……聽製作風格認 DJ",
    colors: { accent: "#86d5cd", accent2: "#ccb9df", onAccent: "#142927" },
    artists: ["calvinharris", "guetta", "avicii", "daftpunk", "marshmello", "chainsmokers", "kygo"],
  },
  {
    id: "latin",
    name: "拉丁熱浪",
    icon: "🌶️",
    desc: "Bad Bunny、Shakira、KAROL G……",
    colors: { accent: "#d5bc86", accent2: "#dfb9b9", onAccent: "#292314" },
    artists: ["badbunny", "shakira", "jbalvin", "karolg", "daddyyankee", "ozuna", "rosalia", "pesopluma", "feid", "rauw"],
  },
  {
    id: "asia",
    name: "印度與泰國",
    icon: "🪷",
    desc: "寶萊塢配樂與泰國流行樂",
    colors: { accent: "#d5ad86", accent2: "#b9dfdc", onAccent: "#291f14" },
    artists: ["arijit", "rahman", "shreya", "bodyslam", "palmy", "phum", "anirudh", "diljit", "adityarikhari", "anuvjain", "jasleen", "jeffsatur", "tillybirds", "fhero", "saran", "4eve", "threemandown"],
  },
];

// 「大亂鬥」展開成全部歌手；每個歌單也變成一個「假歌手」，讓計分、成績圖可以沿用
for (const group of window.GROUPS) {
  if (group.artists === "*") group.artists = window.ARTISTS.filter((a) => a.id !== "onesong").map((a) => a.id);
  group.artists = group.artists.filter((id) => window.ARTISTS.some((a) => a.id === id));
  group.subject = {
    id: `group-${group.id}`,
    name: group.name,
    short: group.name,
    icon: group.icon,
    colors: group.colors,
    ranks: GROUP_RANKS,
  };
}

fn encode_base64(bytes: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::new();
    let mut i = 0;
    while i < bytes.len() {
        let b0 = bytes[i] as u32;
        let b1 = if i + 1 < bytes.len() {
            bytes[i + 1] as u32
        } else {
            0
        };
        let b2 = if i + 2 < bytes.len() {
            bytes[i + 2] as u32
        } else {
            0
        };
        let n = (b0 << 16) | (b1 << 8) | b2;
        out.push(TABLE[((n >> 18) & 63) as usize] as char);
        out.push(TABLE[((n >> 12) & 63) as usize] as char);
        out.push(if i + 1 < bytes.len() {
            TABLE[((n >> 6) & 63) as usize] as char
        } else {
            '='
        });
        out.push(if i + 2 < bytes.len() {
            TABLE[(n & 63) as usize] as char
        } else {
            '='
        });
        i += 3;
    }
    out
}

fn main() {
    if std::path::Path::new("icon.ico").exists() {
        let mut res = winres::WindowsResource::new();
        res.set_icon("icon.ico");
        res.compile().expect("failed to compile Windows resources");
    }

    let out_dir = std::env::var("OUT_DIR").expect("OUT_DIR");
    let html_path = "assets/index.html";
    let icon_path = "assets/icon.png";
    let out_html = format!("{out_dir}/installer.html");

    println!("cargo:rerun-if-changed={html_path}");
    println!("cargo:rerun-if-changed={icon_path}");
    println!("cargo:rerun-if-changed=../public/icon.svg");

    let mut html = std::fs::read_to_string(html_path).expect("read installer HTML");
    let icon_src = if std::path::Path::new(icon_path).exists() {
        let bytes = std::fs::read(icon_path).expect("read icon.png");
        format!("data:image/png;base64,{}", encode_base64(&bytes))
    } else {
        String::new()
    };
    html = html.replace("__ICON_SRC__", &icon_src);
    std::fs::write(out_html, html).expect("write generated installer HTML");
}

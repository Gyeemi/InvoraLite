pub fn get_device_id() -> String {
    machine_uid::get().unwrap_or_else(|_| "unknown-device".to_string())
}

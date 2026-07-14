(function () {
  try {
    var theme = localStorage.getItem("invora_theme");
    document.documentElement.classList.add(theme === "light" ? "light" : "dark");
  } catch (e) {
    document.documentElement.classList.add("dark");
  }
})();

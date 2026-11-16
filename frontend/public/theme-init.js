(function () {
  try {
    var saved = localStorage.getItem("sharp.theme");
    var theme = saved === "light" ? "light" : "dark";
    document.documentElement.dataset.theme = theme;
    document.documentElement.classList.toggle("light", theme === "light");
  } catch (e) {
    document.documentElement.dataset.theme = "dark";
  }
})();

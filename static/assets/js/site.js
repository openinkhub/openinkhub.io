// openink Hub — small progressive enhancements (site works fully without JS)
(function () {
  var header = document.querySelector(".site-header");
  var btn = document.querySelector(".menu-btn");
  var nav = document.getElementById("mobile-nav");
  if (btn && nav) {
    btn.addEventListener("click", function () {
      var open = nav.classList.toggle("open");
      btn.setAttribute("aria-expanded", open ? "true" : "false");
    });
  }
  var onScroll = function () { header && header.classList.toggle("scrolled", window.scrollY > 8); };
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  // gentle reveal for cards/sections
  if ("IntersectionObserver" in window && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
    // blog post cards are never hidden: long category grids must show every article, even on a fast scroll
    var els = document.querySelectorAll(".svc-card,.era-item,.check-list li,.person,.quote,.wa-item,.contact-card");
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } });
    }, { rootMargin: "0px 0px -40px 0px" });
    els.forEach(function (el) { el.classList.add("reveal"); io.observe(el); });
    // safety net: anything the observer missed becomes visible after a moment
    setTimeout(function () { els.forEach(function (el) { el.classList.add("in"); }); }, 2500);
  }
})();

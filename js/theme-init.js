// Aplica o tema salvo antes da página aparecer (evita "piscar" de claro para escuro).
(function () {
  try {
    var m = JSON.parse(localStorage.getItem('passadados:v1:meta') || 'null');
    if (m && m.theme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
      var t = document.querySelector('meta[name="theme-color"]');
      if (t) t.setAttribute('content', '#0c1424');
    }
  } catch (e) { /* sem armazenamento disponível: segue com o tema claro */ }
})();

(function() {
  'use strict';

  const initNavigation = () => {
    const navMenu = document.getElementById('navMenu');
    const btnOpen = document.getElementById('btnOpen');
    const btnClose = document.getElementById('btnClose');
    const listLinks = document.querySelectorAll('.list-link');

    if (!navMenu || !btnOpen || !btnClose) return;

    const openMenu = () => navMenu.classList.add('show-menu');
    const closeMenu = () => navMenu.classList.remove('show-menu');

    btnOpen.addEventListener('click', openMenu);
    btnClose.addEventListener('click', closeMenu);

    listLinks.forEach(link => {
      link.addEventListener('click', closeMenu);
    });

    document.addEventListener('click', (e) => {
      if (!navMenu.contains(e.target) && !btnOpen.contains(e.target)) {
        closeMenu();
      }
    });
  };

  const initTheme = () => {
    const btnTheme = document.getElementById('btnTheme');
    if (!btnTheme) return;

    const icon = btnTheme.querySelector('i');
    const savedTheme = localStorage.getItem('theme');

    if (savedTheme === 'light') {
      document.body.classList.add('light');
      icon.classList.replace('bxs-moon', 'bxs-sun');
    }

    btnTheme.addEventListener('click', () => {
      document.body.classList.toggle('light');
      const isLight = document.body.classList.contains('light');

      if (isLight) {
        icon.classList.replace('bxs-moon', 'bxs-sun');
        localStorage.setItem('theme', 'light');
      } else {
        icon.classList.replace('bxs-sun', 'bxs-moon');
        localStorage.removeItem('theme');
      }
    });
  };

  const initSearch = () => {
    const buscador = document.getElementById('buscador');
    const mensajeNoEncontrado = document.getElementById('mensaje-no-encontrado');
    const tarjetas = document.querySelectorAll('.services-card');

    if (!buscador || !mensajeNoEncontrado || tarjetas.length === 0) return;

    buscador.addEventListener('input', function() {
      const filtro = this.value.toLowerCase().trim();
      let hayResultados = false;

      tarjetas.forEach(tarjeta => {
        const titulo = tarjeta.querySelector('.h3');
        if (!titulo) return;

        const texto = titulo.textContent.toLowerCase();
        const coincide = texto.includes(filtro);

        tarjeta.style.display = coincide ? '' : 'none';
        if (coincide) hayResultados = true;
      });

      mensajeNoEncontrado.classList.toggle('show', !hayResultados && filtro.length > 0);
    });
  };

  const initTypedEffect = () => {
    const heroDescription = document.querySelector('.hero-description');
    if (!heroDescription || !window.Typed) return;

    const textoOriginal = heroDescription.innerHTML;
    
    if (heroDescription.querySelector('span')) {
      new Typed('.hero-description span', {
        strings: ['Validación.', 'Ofertas.', 'Droguerías.'],
        typeSpeed: 60,
        backSpeed: 60,
        loop: true,
        cursorChar: '|',
      });
    }
  };

  document.addEventListener('DOMContentLoaded', () => {
    initNavigation();
    initTheme();
    initSearch();
    initTypedEffect();
  });

})();

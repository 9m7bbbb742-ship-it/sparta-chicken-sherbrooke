(() => {
 const toggle = document.querySelector('.menu-toggle');
 const nav = document.querySelector('.nav');
 if (toggle && nav) {
   toggle.addEventListener('click', () => {
     const open = nav.classList.toggle('open');
     toggle.setAttribute('aria-expanded', String(open));
     toggle.textContent = open ? '×' : '☰';
   });
   nav.querySelectorAll('a').forEach(link => link.addEventListener('click', () => {
     nav.classList.remove('open'); toggle.setAttribute('aria-expanded','false'); toggle.textContent='☰';
   }));
 }
 const items = document.querySelectorAll('.reveal');
 if ('IntersectionObserver' in window) {
   const observer = new IntersectionObserver(entries => entries.forEach(entry => {
     if (entry.isIntersecting) { entry.target.classList.add('visible'); observer.unobserve(entry.target); }
   }), { threshold: 0.12 });
   items.forEach(item => observer.observe(item));
 } else items.forEach(item => item.classList.add('visible'));
 const video = document.querySelector('.hero-video');
 if (video) { const play = video.play(); if (play && play.catch) play.catch(() => { video.controls = true; }); }
 const year = document.getElementById('year'); if (year) year.textContent = new Date().getFullYear();
})();

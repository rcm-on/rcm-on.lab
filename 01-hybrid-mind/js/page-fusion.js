(function () {
    document.body.classList.add('fx-ready');

    var canvas = document.getElementById('ambientCanvas');
    if (!canvas) return;

    var ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    var pointer = { x: 0.5, y: 0.35, tx: 0.5, ty: 0.35 };
    var particles = [];
    var particleCount = window.innerWidth < 760 ? 12 : 22;
    var sceneSections = Array.from(document.querySelectorAll('.scene-section'));
    var nodeButtons = Array.from(document.querySelectorAll('.home-node-index .home-node'));
    var topNavAnchors = Array.from(document.querySelectorAll('.top-nav-links a[href^="#"]'));
    var width = 0;
    var height = 0;
    var frameTick = 0;
    var rafId = null;

    function clamp(v, min, max) {
        return Math.max(min, Math.min(max, v));
    }

    function resize() {
        var ratio = Math.max(window.devicePixelRatio || 1, 1);
        width = window.innerWidth;
        height = window.innerHeight;
        canvas.width = Math.floor(width * ratio);
        canvas.height = Math.floor(height * ratio);
        canvas.style.width = width + 'px';
        canvas.style.height = height + 'px';
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    }

    function makeParticle() {
        return {
            x: Math.random() * width,
            y: Math.random() * height,
            r: 1 + Math.random() * 2.4,
            vx: (Math.random() - 0.5) * 0.25,
            vy: (Math.random() - 0.5) * 0.2,
            hue: Math.random() > 0.5 ? 22 : 225,
            alpha: 0.12 + Math.random() * 0.24
        };
    }

    function initParticles() {
        particles.length = 0;
        for (var i = 0; i < particleCount; i += 1) {
            particles.push(makeParticle());
        }
    }

    function updatePointer(x, y) {
        pointer.tx = clamp(x / width, 0, 1);
        pointer.ty = clamp(y / height, 0, 1);
    }

    function updateSections() {
        var activeSection = null;
        var nearest = Number.POSITIVE_INFINITY;

        sceneSections.forEach(function (section) {
            var rect = section.getBoundingClientRect();
            var viewportCenter = window.innerHeight * 0.5;
            var sectionCenter = rect.top + (rect.height * 0.5);
            var centerDelta = (sectionCenter - viewportCenter) / Math.max(window.innerHeight, 1);
            var localMix = Math.max(0.22, Math.min(1, 1 - Math.abs(centerDelta) * 1.06));
            section.style.setProperty('--open-level', localMix.toFixed(4));
            section.classList.toggle('is-open', localMix > 0.56);

            var distance = Math.abs((rect.top + rect.height * 0.5) - (window.innerHeight * 0.45));
            if (distance < nearest) {
                nearest = distance;
                activeSection = section;
            }
        });

        if (!activeSection) return;

        var activeId = activeSection.id;
        var activeTone = activeSection.dataset.tone || 'cobalt';
        document.body.dataset.tone = activeTone;

        topNavAnchors.forEach(function (anchor) {
            var href = anchor.getAttribute('href') || '';
            anchor.classList.toggle('is-active', href === '#' + activeId);
        });

        nodeButtons.forEach(function (node) {
            var href = node.getAttribute('href') || '';
            var targetId = href.startsWith('#') ? href.slice(1) : '';
            var targetSection = targetId ? document.getElementById(targetId) : null;
            var openLevel = targetSection ? parseFloat(getComputedStyle(targetSection).getPropertyValue('--open-level') || '0') : 0;
            node.classList.toggle('is-near', openLevel > 0.58);
            node.classList.toggle('is-active', targetId === activeId);
        });
    }

    function draw() {
        pointer.x += (pointer.tx - pointer.x) * 0.06;
        pointer.y += (pointer.ty - pointer.y) * 0.06;
        ctx.clearRect(0, 0, width, height);

        var grad = ctx.createRadialGradient(width * pointer.x, height * pointer.y, 60, width * pointer.x, height * pointer.y, Math.max(width, height) * 0.6);
        grad.addColorStop(0, 'rgba(95,125,255,0.16)');
        grad.addColorStop(0.42, 'rgba(255,122,54,0.09)');
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, width, height);

        for (var i = 0; i < particles.length; i += 1) {
            var p = particles[i];
            p.x += p.vx + (pointer.x - 0.5) * 0.26;
            p.y += p.vy + (pointer.y - 0.5) * 0.18;
            if (p.x < -20) p.x = width + 20;
            if (p.x > width + 20) p.x = -20;
            if (p.y < -20) p.y = height + 20;
            if (p.y > height + 20) p.y = -20;

            ctx.beginPath();
            ctx.fillStyle = 'hsla(' + p.hue + ', 96%, 66%, ' + p.alpha + ')';
            ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
            ctx.fill();
        }

        frameTick += 1;
        if (frameTick % 2 === 0) {
            var maxDist = 108;
            var maxDistSq = maxDist * maxDist;
            ctx.lineWidth = 1;
            for (var iA = 0; iA < particles.length; iA += 1) {
                var a = particles[iA];
                for (var iB = iA + 1; iB < particles.length; iB += 1) {
                    var b = particles[iB];
                    var dx = a.x - b.x;
                    var dy = a.y - b.y;
                    var distSq = dx * dx + dy * dy;
                    if (distSq < maxDistSq) {
                        var dist = Math.sqrt(distSq);
                        var alpha = (1 - dist / maxDist) * 0.1;
                        ctx.strokeStyle = 'rgba(170,188,255,' + alpha + ')';
                        ctx.beginPath();
                        ctx.moveTo(a.x, a.y);
                        ctx.lineTo(b.x, b.y);
                        ctx.stroke();
                    }
                }
            }
        }

        updateSections();
        rafId = requestAnimationFrame(draw);
    }

    resize();
    initParticles();
    updateSections();
    draw();

    window.addEventListener('resize', function () {
        resize();
        initParticles();
        updateSections();
    });

    window.addEventListener('scroll', updateSections, { passive: true });
    window.addEventListener('pointermove', function (event) {
        updatePointer(event.clientX, event.clientY);
    }, { passive: true });

    window.addEventListener('touchmove', function (event) {
        var touch = event.touches && event.touches[0];
        if (touch) updatePointer(touch.clientX, touch.clientY);
    }, { passive: true });

    document.addEventListener('visibilitychange', function () {
        if (document.hidden && rafId) {
            cancelAnimationFrame(rafId);
            rafId = null;
        } else if (!document.hidden && !rafId) {
            draw();
        }
    });
})();

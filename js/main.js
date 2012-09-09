var wavepad = (function () {

    var surface,
        finger,
        source,
        nodes = {},
        myAudioContext,
        hasTouch = 'ontouchstart' in window || 'createTouch' in document,
        eventStart = hasTouch ? 'touchstart' : 'mousedown',
        eventMove = hasTouch ? 'touchmove' : 'mousemove',
        eventEnd = hasTouch ? 'touchend' : 'mouseup',
        isMuted = false;

        return {

            init: function () {
                var doc = document;

                if ('webkitAudioContext' in window || 'AudioContext' in window) {
                    myAudioContext = new webkitAudioContext() || AudioContext();
                } else {
                    alert('Your browser does not support Web Audio API');
                    return;
                }

                doc.getElementById('waveform').addEventListener('change', wavepad.sliderChange, false);
                doc.getElementById('filter-type').addEventListener('change', wavepad.filterChange, false);
                doc.getElementById('volume').addEventListener('change', wavepad.sliderChange, false);

                surface = doc.querySelector('.surface');
                surface.addEventListener(eventStart, wavepad.play, false);

                finger = doc.querySelector('.finger');

                doc.addEventListener('touchmove', function (e) {
                    e.preventDefault();
                });
            },

            routeSounds: function (source) {
                var doc = document;
                var filterType = doc.querySelector('#filter-type').value;
                var volumeInput = doc.querySelector('#volume').value;

                nodes.filter = myAudioContext.createBiquadFilter();
                nodes.volume = myAudioContext.createGainNode();

                nodes.filter.type = filterType;
                nodes.volume.gain.value = volumeInput;

                source.connect(nodes.filter);
                nodes.filter.connect(nodes.volume);
                nodes.volume.connect(myAudioContext.destination);

                return source;
            },

            play: function (e) {
                var x = e.pageX - surface.offsetLeft;
                var y = e.pageY - surface.offsetTop;

                if (myAudioContext.activeSourceCount > 0) {
                    wavepad.kill();
                }

                source = myAudioContext.createOscillator();
                source.type = document.querySelector('#waveform').value; // sine wave
                source = wavepad.routeSounds(source);
                source.frequency.value = 512 - x;
                nodes.filter.frequency.value = 512 - y;
                source.noteOn(0);

                finger.style.webkitTransform = finger.style.MozTransform = finger.style.msTransform = finger.style.OTransform = finger.style.transform = 'translate(' + (x - finger.offsetWidth / 2) + 'px,' + (y - finger.offsetHeight / 2) + 'px)';
                finger.className = 'finger active';
                surface.className = 'surface pressed';

                surface.addEventListener(eventMove, wavepad.effect, false);
                surface.addEventListener(eventEnd, wavepad.stop, false);
            },

            stop: function (e) {
                var x = e.pageX - surface.offsetLeft;
                var y = e.pageY - surface.offsetTop;

                if (myAudioContext.activeSourceCount > 0) {
                    source.frequency.value = 512 - x;
                    nodes.filter.frequency.value = 512 - y;
                    source.noteOff(0);
                }

                finger.className = 'finger';
                surface.className = 'surface';

                surface.removeEventListener(eventMove, wavepad.effect, false);
                surface.removeEventListener(eventEnd, wavepad.stop, false);
            },

            kill: function () {
                source.noteOff(0);
                finger.className = 'finger';
                surface.className = 'surface';

                surface.removeEventListener(eventMove, wavepad.effect, false);
                surface.removeEventListener(eventEnd, wavepad.stop, false);
            },

            effect: function (e) {
                var x = e.pageX - surface.offsetLeft;
                var y = e.pageY - surface.offsetTop;
                if (myAudioContext.activeSourceCount > 0) {
                    source.frequency.value = 512 - x;
                    nodes.filter.frequency.value = 512 - y;
                }

                finger.style.webkitTransform = finger.style.MozTransform = finger.style.msTransform = finger.style.OTransform = finger.style.transform = 'translate(' + (x - finger.offsetWidth / 2) + 'px,' + (y - finger.offsetHeight / 2) + 'px)';
            },

            sliderChange: function (slider) {
                if (myAudioContext.activeSourceCount > 0) {
                    if (slider.id == 'waveform') {
                        wavepad.stop();
                        wavepad.play();
                    } else if (slider.id == 'frequency') {
                        source.frequency.value = slider.value;
                    } else if (slider.id == 'volume') {
                        nodes.volume.gain.value = slider.value;
                    }
                }
            },

            filterChange: function (slider) {
                if (myAudioContext.activeSourceCount > 0) {
                    if (slider.id == 'filter-type') {
                        nodes.filter.type = slider.value;
                    }
                }
            }
        };
}());

window.addEventListener("DOMContentLoaded", wavepad.init, true);
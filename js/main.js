/*global alert: false, clearInterval: false, clearTimeout: false, document: false, event: false, frames: false, history: false, Image: false, location: false, name: false, navigator: false, Option: false, parent: false, screen: false, setInterval: false, setTimeout: false, window: false, XMLHttpRequest: false, console: false, webkitAudioContext: false, AudioContext: false, requestAnimationFrame: false, Uint8Array: false, Tap: false */

var wavepad = (function () {

	'use strict';

	var surface,
		finger,
		source,
		nodes = {},
		myAudioContext,
		myAudioAnalyser,
		mySpectrum,
		impulseResponse,
		hasTouch = 'ontouchstart' in window || 'createTouch' in document,
		eventStart = hasTouch ? 'touchstart' : 'mousedown',
		eventMove = hasTouch ? 'touchmove' : 'mousemove',
		eventEnd = hasTouch ? 'touchend' : 'mouseup',
		isSmallViewport = false,
		isMuted = false;

	return {

		init: function () {
			var doc = document;

			if ('webkitAudioContext' in window) {
				myAudioContext = new webkitAudioContext();
			} else if ('AudioContext' in window) {
				myAudioContext = new AudioContext();
			} else {
				alert('Your browser does not yet support the Web Audio API');
				return;
			}

			if (window.matchMedia) {
				isSmallViewport = window.matchMedia("(max-width: 512px)").matches ? true : false;

				window.matchMedia("(max-width: 512px)").addListener(function (mql) {
					if (mql.matches) {
						isSmallViewport = true;
					} else {
						isSmallViewport = false;
					}
				});
			}

			doc.getElementById('waveform').addEventListener('change', wavepad.sliderChange, false);
			doc.getElementById('filter-type').addEventListener('change', wavepad.filterChange, false);
			doc.getElementById('delay').addEventListener('input', wavepad.sliderChange, false);
			doc.getElementById('feedback').addEventListener('input', wavepad.sliderChange, false);

			surface = doc.querySelector('.surface');
			finger = doc.querySelector('.finger');

			nodes.filter = myAudioContext.createBiquadFilter();
			nodes.volume = myAudioContext.createGainNode();
			nodes.delay = myAudioContext.createDelayNode();
			nodes.feedbackGain = myAudioContext.createGainNode();

			myAudioAnalyser = myAudioContext.createAnalyser();
			myAudioAnalyser.smoothingTimeConstant = 0.85;

			wavepad.updateOutputs();
			wavepad.animateSpectrum();

			surface.addEventListener(eventStart, wavepad.play, false);

			doc.querySelector('.surface').addEventListener('touchmove', function (e) {
				e.preventDefault();
			});

			document.addEventListener('webkitvisibilitychange', wavepad.handleVisibilityChange, false);
			document.addEventListener('visibilitychange', wavepad.handleVisibilityChange, false);
		},

		handleVisibilityChange: function () {
			if (document.hidden || document.webkitHidden) {
				myAudioAnalyser.disconnect();
			}
		},

		routeSounds: function () {
			var doc = document;

			source = myAudioContext.createOscillator();

			source.type = parseInt(doc.getElementById('waveform').value, 10);
			nodes.filter.type = parseInt(doc.getElementById('filter-type').value, 10);
			nodes.feedbackGain.gain.value = doc.getElementById('feedback').value;
			nodes.delay.delayTime.value = doc.getElementById('delay').value;
			nodes.volume.gain.value = 0.2;

			source.connect(nodes.filter);
			nodes.filter.connect(nodes.volume);
			nodes.filter.connect(nodes.delay);
			nodes.delay.connect(nodes.feedbackGain);
			nodes.feedbackGain.connect(nodes.volume);
			nodes.feedbackGain.connect(nodes.delay);
			nodes.volume.connect(myAudioAnalyser);
			myAudioAnalyser.connect(myAudioContext.destination);
		},

		play: function (e) {
			var x = e.pageX - surface.offsetLeft,
				y = e.pageY - surface.offsetTop,
				multiplier = isSmallViewport ? 2 : 1;

			if (myAudioContext.activeSourceCount > 0) {
				wavepad.kill();
			}

			wavepad.routeSounds();
			source.frequency.value = x * multiplier;
			nodes.filter.frequency.value = 512 - (y * multiplier);
			source.noteOn(0);

			finger.style.webkitTransform = finger.style.MozTransform = finger.style.msTransform = finger.style.OTransform = finger.style.transform = 'translate3d(' + x + 'px,' + y  + 'px, 0)';
			finger.classList.add('active');

			surface.addEventListener(eventMove, wavepad.effect, false);
			surface.addEventListener(eventEnd, wavepad.stop, false);

			if (hasTouch) {
				surface.addEventListener('touchcancel', wavepad.kill, false);
			}
		},

		stop: function (e) {
			var x = e.pageX - surface.offsetLeft,
				y = e.pageY - surface.offsetTop,
				multiplier = isSmallViewport ? 2 : 1;

			if (myAudioContext.activeSourceCount > 0) {
				source.frequency.value = x * multiplier;
				nodes.filter.frequency.value = 512 - (y * multiplier);
				source.noteOff(0);
			}

			finger.classList.remove('active');

			surface.removeEventListener(eventMove, wavepad.effect, false);
			surface.removeEventListener(eventEnd, wavepad.stop, false);

			if (hasTouch) {
				surface.removeEventListener('touchcancel', wavepad.kill, false);
			}
		},

		kill: function () {

			if (myAudioContext.activeSourceCount > 0) {
				source.noteOff(0);
			}

			finger.classList.remove('active');

			surface.removeEventListener(eventMove, wavepad.effect, false);
			surface.removeEventListener(eventEnd, wavepad.stop, false);

			if (hasTouch) {
				surface.removeEventListener('touchcancel', wavepad.kill, false);
			}
		},

		effect: function (e) {
			var x = e.pageX - surface.offsetLeft,
				y = e.pageY - surface.offsetTop,
				multiplier = isSmallViewport ? 2 : 1;

			if (myAudioContext.activeSourceCount > 0) {
				source.frequency.value = x * multiplier;
				nodes.filter.frequency.value = 512 - (y * multiplier);
			}

			finger.style.webkitTransform = finger.style.MozTransform = finger.style.msTransform = finger.style.OTransform = finger.style.transform = 'translate3d(' + x + 'px,' + y + 'px, 0)';
		},

		updateOutputs: function (e) {
			var doc = document;
			doc.getElementById('delay-output').value = Math.round(doc.getElementById('delay').value * 1000) + ' ms';
			doc.getElementById('feedback-output').value = Math.round(doc.getElementById('feedback').value * 10);
		},

		sliderChange: function (slider) {
			if (myAudioContext.activeSourceCount > 0) {
				if (slider.id === 'waveform') {
					wavepad.stop();
					wavepad.play();
				} else if (slider.id === 'frequency') {
					source.frequency.value = slider.value;
				} else if (slider.id === 'delay') {
					nodes.delay.delayTime.value = slider.value;
				} else if (slider.id === 'feedback') {
					nodes.feedbackGain.gain.value = slider.value;
				}
			}
			wavepad.updateOutputs();
		},

		filterChange: function (slider) {
			if (myAudioContext.activeSourceCount > 0) {
				if (slider.id === 'filter-type') {
					nodes.filter.type = slider.value;
				}
			}
		},

		animateSpectrum: function () {
			mySpectrum = requestAnimationFrame(wavepad.animateSpectrum, document.querySelector('canvas'));
			wavepad.drawSpectrum();
		},

		drawSpectrum: function () {
			var canvas = document.querySelector('canvas'),
				ctx = canvas.getContext('2d'),
				canvasSize = isSmallViewport ? 256 : 512,
				multiplier = isSmallViewport ? 1 : 2,
				width = canvasSize,
				height = canvasSize,
				bar_width = isSmallViewport ? 10 : 20,
				freqByteData,
				barCount,
				magnitude,
				i;

			canvas.width = canvasSize - 10;
			canvas.height = canvasSize - 10;

			ctx.clearRect(0, 0, width, height);
			ctx.fillStyle = '#1d1c25';

			freqByteData = new Uint8Array(myAudioAnalyser.frequencyBinCount);
			myAudioAnalyser.getByteFrequencyData(freqByteData);
			barCount = Math.round(width / bar_width);

			for (i = 0; i < barCount; i += 1) {
				magnitude = freqByteData[i];
				// some values need adjusting to fit on the canvas
				ctx.fillRect(bar_width * i, height, bar_width - 1, -magnitude * multiplier);
			}
		}
	};
}());

window.addEventListener("DOMContentLoaded", wavepad.init, true);
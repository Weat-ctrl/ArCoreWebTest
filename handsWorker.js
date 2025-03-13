importScripts('https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js');

const hands = new Hands({
  locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
});

hands.setOptions({
  maxNumHands: 1,
  modelComplexity: 1,
  minDetectionConfidence: 0.7,
  minTrackingConfidence: 0.7,
});

hands.onResults((results) => {
  postMessage(results);
});

onmessage = async (event) => {
  await hands.send({ image: event.data.image });
};

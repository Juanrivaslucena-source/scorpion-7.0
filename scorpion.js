const axios = require('axios');
require('dotenv').config();

const OMNIROUTE = process.env.OMNIROUTE_URL || 'http://localhost:20128/v1';
const OMNIROUTE_KEY = process.env.OMNIROUTE_KEY;
const HIGGSFIELD_URL = process.env.HIGGSFIELD_URL || 'https://api.higgsfield.ai/v1';
const HIGGSFIELD_KEY = process.env.HIGGSFIELD_KEY;

// Step 1: Text idea -> refined video prompt, via OmniRoute (handles routing + fallbacks).
async function generatePrompt(idea) {
  const res = await axios.post(
    `${OMNIROUTE}/messages`,
    {
      model: 'gpt-4-vision',
      messages: [{ role: 'user', content: `Generate a detailed video prompt for: ${idea}` }],
      max_tokens: 200,
    },
    { headers: { Authorization: `Bearer ${OMNIROUTE_KEY}` } }
  );

  // OmniRoute normalizes responses to OpenAI's shape.
  return res.data.choices[0].message.content;
}

// Step 2: Prompt -> video, via Higgsfield.
// NOTE: this is a placeholder call. Replace the endpoint/params with the real
// Higgsfield video-generation API once you have the exact contract.
async function generateVideo(prompt) {
  if (!HIGGSFIELD_KEY) {
    console.log('⚠️  HIGGSFIELD_KEY not set — skipping the video step for now.');
    return null;
  }

  const res = await axios.post(
    `${HIGGSFIELD_URL}/generate`,
    { prompt },
    { headers: { Authorization: `Bearer ${HIGGSFIELD_KEY}` } }
  );
  return res.data;
}

async function main() {
  const idea = process.argv.slice(2).join(' ') || 'Modern product launch, cyan/black, cinematic';

  if (!OMNIROUTE_KEY) {
    console.error('❌ OMNIROUTE_KEY is missing. Copy .env.example to .env and fill it in.');
    process.exit(1);
  }

  try {
    console.log(`🦂 Idea: ${idea}`);

    const prompt = await generatePrompt(idea);
    console.log('✅ Video prompt:\n', prompt);

    const video = await generateVideo(prompt);
    if (video) console.log('🎬 Video:', video);
  } catch (err) {
    const detail = err.response
      ? `${err.response.status} ${JSON.stringify(err.response.data)}`
      : err.message;
    console.error('❌ Pipeline failed:', detail);
    process.exit(1);
  }
}

main();

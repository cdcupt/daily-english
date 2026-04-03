#!/bin/bash
# Generate Dailingo app icon via OpenRouter API (Gemini 2.5 Flash Image)
# Usage: ./generate_icon.sh

set -e

OUTPUT_FILE="$(dirname "$0")/AppIcon_ai.png"
API_KEY="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"

echo "🎨 Generating Dailingo app icon..."

curl -s https://openrouter.ai/api/v1/chat/completions \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -H "HTTP-Referer: https://dailingo.app" \
  -H "X-Title: Dailingo" \
  -d '{
    "model": "bytedance-seed/seedream-4.5",
    "modalities": ["image"],
    "messages": [{"role": "user", "content": "Generate a professional iOS app icon (1024x1024 square) for a language learning app. Design: Smooth teal-to-dark-teal gradient background (#14B8A6 to #0F766E). Center: a cute friendly cartoon golden cat character with big round eyes, pink nose, whiskers - drawn in clean vector illustration style, NOT emoji. Below the cat: a small white open book. Top-right: 2 small white geometric star sparkles. Style: clean modern flat illustration. NO text, NO letters, NO emoji characters. iOS rounded corners."}],
    "max_tokens": 4096
  }' | python3 -c "
import json, sys, base64, os

output = os.environ.get('OUTPUT_FILE', 'AppIcon_ai.png')
raw = sys.stdin.read()

try:
    data = json.loads(raw)
except:
    print('Failed to parse response:', raw[:300])
    sys.exit(1)

if 'error' in data:
    print('ERROR:', data['error']['message'])
    sys.exit(1)

content = data['choices'][0]['message']['content']
if isinstance(content, list):
    for part in content:
        if part.get('type') == 'image_url':
            url = part['image_url']['url']
            if url.startswith('data:image'):
                _, b64 = url.split(',', 1)
                imgdata = base64.b64decode(b64)
                with open(output, 'wb') as f:
                    f.write(imgdata)
                print(f'Saved: {output} ({len(imgdata)} bytes)')
            else:
                print(f'Image URL: {url}')
        elif part.get('type') == 'text' and part.get('text'):
            print(part['text'][:200])
else:
    print('Unexpected response:', str(content)[:300])
    sys.exit(1)
"

if [ -f "$OUTPUT_FILE" ]; then
    echo "✅ Icon saved to: $OUTPUT_FILE"
    echo "   To apply: cp $OUTPUT_FILE DailyEnglish/Resources/Assets.xcassets/AppIcon.appiconset/AppIcon.png"
else
    echo "❌ Icon generation failed"
    exit 1
fi

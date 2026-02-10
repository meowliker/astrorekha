# PalmCosmic Setup Guide

## 🔑 API Keys Configuration

Add these to your `.env.local` file:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key

# Stripe
STRIPE_SECRET_KEY=sk_test_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...

# Anthropic (Claude AI)
ANTHROPIC_API_KEY=sk-ant-api03-...
```

## 📦 Features Implemented

### 1. **Claude AI Chatbot** ✅
- **Location**: Floating chatbot button (bottom-right corner)
- **API Route**: `/api/chat`
- **Usage**: 
  ```typescript
  // The chatbot is automatically available on all pages
  // Just add the Chatbot component to your layout
  import { Chatbot } from "@/components/Chatbot";
  ```

### 2. **PDF Generation** ✅
- **API Route**: `/api/generate-pdf`
- **Usage**:
  ```typescript
  const response = await fetch('/api/generate-pdf', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      palmReading: {
        love: "Your heart line shows...",
        health: "Your life line indicates...",
        career: "Your fate line suggests...",
        wisdom: "Your head line reveals..."
      },
      userInfo: {
        name: "John Doe"
      }
    })
  });
  
  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'palm-reading.pdf';
  a.click();
  ```

### 3. **Computer Vision Palm Detection** ✅
- **Library**: MediaPipe Hands
- **Features**:
  - Accurate fingertip detection (5 points)
  - Palm line calculation (Heart, Head, Life, Fate lines)
  - Real-time landmark detection
  
- **Usage**:
  ```typescript
  import { PalmDetector } from "@/components/PalmDetector";
  
  <PalmDetector
    imageData={capturedImageBase64}
    onDetectionComplete={(data) => {
      console.log('Fingertips:', data.fingertips);
      console.log('Palm Lines:', data.palmLines);
    }}
  />
  ```

## 🎯 How to Get API Keys

### Claude AI (Anthropic)
1. Go to [console.anthropic.com](https://console.anthropic.com)
2. Sign up / Log in
3. Navigate to API Keys
4. Create new key
5. Copy and paste into `.env.local` as `ANTHROPIC_API_KEY`

### Supabase
1. Go to [supabase.com](https://supabase.com)
2. Create new project
3. Go to Project Settings → API
4. Copy:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - Anon/Public Key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### Stripe
1. Go to [dashboard.stripe.com](https://dashboard.stripe.com)
2. Get test keys from Developers → API Keys
3. Copy:
   - Secret key → `STRIPE_SECRET_KEY`
   - Publishable key → `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`

## 🚀 Running the App

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Open browser
# http://localhost:3000
```

## 📊 Palm Detection Accuracy

The MediaPipe Hands model provides:
- **21 hand landmarks** with 3D coordinates
- **Fingertip detection**: Landmarks 4, 8, 12, 16, 20
- **Palm lines**: Calculated from landmark positions
  - Heart Line: Horizontal across upper palm
  - Head Line: Diagonal in middle palm
  - Life Line: Curved from thumb to wrist
  - Fate Line: Vertical in center palm

## 🎨 Customizing Palm Line Detection

Edit `src/lib/palm-detection.ts`:

```typescript
export function calculatePalmLines(landmarks: any[]) {
  // Customize line calculations here
  // landmarks[0-20] are the 21 hand points
  // Each landmark has x, y, z coordinates (0-1 range)
}
```

## 💬 Chatbot Customization

Edit the system prompt in `src/app/api/chat/route.ts`:

```typescript
const systemPrompt = `You are a mystical palm reading expert...`;
```

## 📄 PDF Customization

Edit `src/app/api/generate-pdf/route.ts` to:
- Change colors, fonts, layout
- Add images or charts
- Customize sections

## 🔧 Troubleshooting

### MediaPipe not loading
- Check internet connection (loads from CDN)
- Ensure image is properly formatted (JPEG/PNG)
- Check browser console for errors

### Claude API errors
- Verify API key is correct
- Check API quota/billing
- Ensure proper model name: `claude-sonnet-4-20250514`

### PDF not generating
- Check console for errors
- Verify palmReading data structure
- Ensure jsPDF is installed

## 📱 Adding Chatbot to Pages

```typescript
// In your layout or page
import { Chatbot } from "@/components/Chatbot";

export default function Layout({ children }) {
  return (
    <>
      {children}
      <Chatbot />
    </>
  );
}
```

## 🎯 Next Steps

1. Add Claude API key to `.env.local`
2. Test chatbot on any page
3. Test PDF generation from Step 15
4. Integrate real palm detection in Step 13
5. Customize AI prompts for your brand voice

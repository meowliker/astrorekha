/**
 * Test script for palm analysis endpoint
 * 
 * Usage:
 *   node scripts/test-palm-analysis.js <path-to-palm-image>
 * 
 * Example:
 *   node scripts/test-palm-analysis.js ~/Desktop/my-palm.jpg
 */

const fs = require('fs');
const path = require('path');

async function testPalmAnalysis(imagePath) {
  if (!imagePath) {
    console.error('Usage: node scripts/test-palm-analysis.js <path-to-palm-image>');
    console.error('Example: node scripts/test-palm-analysis.js ~/Desktop/palm.jpg');
    process.exit(1);
  }

  // Resolve path
  const resolvedPath = path.resolve(imagePath);
  
  if (!fs.existsSync(resolvedPath)) {
    console.error(`File not found: ${resolvedPath}`);
    process.exit(1);
  }

  console.log(`Reading image: ${resolvedPath}`);
  
  // Read and convert to base64
  const imageBuffer = fs.readFileSync(resolvedPath);
  const base64 = imageBuffer.toString('base64');
  
  // Determine media type
  const ext = path.extname(resolvedPath).toLowerCase();
  const mediaTypes = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
  };
  const mediaType = mediaTypes[ext] || 'image/jpeg';
  
  console.log(`Image size: ${(base64.length / 1024).toFixed(1)} KB (base64)`);
  console.log(`Media type: ${mediaType}`);
  console.log('\nSending to /api/palm-analysis...\n');

  try {
    const response = await fetch('http://localhost:3000/api/palm-analysis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64: base64, mediaType }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Error:', data.error || 'Unknown error');
      process.exit(1);
    }

    console.log('✅ Palm analysis successful!\n');
    console.log('=== Image Quality ===');
    console.log(JSON.stringify(data.analysis.image_quality, null, 2));
    
    console.log('\n=== Hand Identification ===');
    console.log(JSON.stringify(data.analysis.hand_identification, null, 2));
    
    console.log('\n=== Big Three Lines ===');
    console.log('Heart Line:', JSON.stringify(data.analysis.heart_line, null, 2));
    console.log('Head Line:', JSON.stringify(data.analysis.head_line, null, 2));
    console.log('Life Line:', JSON.stringify(data.analysis.life_line, null, 2));
    
    console.log('\n=== Overall Assessment ===');
    console.log(JSON.stringify(data.analysis.overall_assessment, null, 2));
    
    // Save full response to file
    const outputPath = path.join(process.cwd(), 'palm-analysis-result.json');
    fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));
    console.log(`\n📄 Full result saved to: ${outputPath}`);
    
  } catch (error) {
    console.error('Request failed:', error.message);
    console.error('\nMake sure your Next.js dev server is running: npm run dev');
    process.exit(1);
  }
}

// Run the test
testPalmAnalysis(process.argv[2]);

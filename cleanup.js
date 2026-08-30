import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = __dirname;

const dirsToScan = [
  path.join(rootDir, 'src'),
  path.join(rootDir, 'scripts'),
  path.join(rootDir, 'dashboard', 'src'),
];

// Simple regex to match standard emojis and the specific ones from the demo
const emojiRegex = /[\u{1F300}-\u{1F5FF}\u{1F900}-\u{1F9FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E6}-\u{1F1FF}\u{1F191}-\u{1F251}\u{1F004}\u{1F0CF}\u{1F170}-\u{1F171}\u{1F17E}-\u{1F17F}\u{1F18E}\u{3030}\u{2B50}\u{2B55}\u{2934}-\u{2935}\u{2B05}-\u{2B07}\u{2B1B}-\u{2B1C}\u{3297}\u{3299}\u{303D}\u{00A9}\u{00AE}\u{2122}\u{23F3}\u{24C2}\u{23E9}-\u{23EF}\u{25B6}\u{23F8}-\u{23FA}]|[📦🤖🔑🛑✅🔗💡❌✓🛒⏳🔄💾🛡️⌘]/gu;

function cleanFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');

  // Strip emojis
  content = content.replace(emojiRegex, '');

  // Strip block comments except JSDoc
  content = content.replace(/\/\*(?!\*).*?\*\//gs, '');

  // Strip line comments
  // (?!.*?:) ignores http:// and https:// (negative lookbehind is safer but variable support)
  // Let's use lookbehind to ignore ://
  content = content.replace(/(?<![:"']\s*)\/\/.*$/gm, '');

  // Remove triple newlines
  content = content.replace(/\n\s*\n\s*\n/g, '\n\n');

  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`Cleaned: ${filePath}`);
}

function traverseAndClean(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      traverseAndClean(fullPath);
    } else if (fullPath.endsWith('.ts') || fullPath.endsWith('.tsx') || fullPath.endsWith('.prisma') || fullPath.endsWith('.js')) {
      if (fullPath !== __filename) {
        cleanFile(fullPath);
      }
    }
  }
}

console.log('Starting cleanup...');
for (const dir of dirsToScan) {
  if (fs.existsSync(dir)) {
    traverseAndClean(dir);
  }
}

const prismaFile = path.join(rootDir, 'prisma', 'schema.prisma');
if (fs.existsSync(prismaFile)) {
  cleanFile(prismaFile);
}

console.log('Cleanup complete!');

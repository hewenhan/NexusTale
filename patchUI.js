const fs = require('fs');
let content = fs.readFileSync('src/components/RagStatusIndicator.tsx', 'utf-8');

content = content.replace(
  /<motion\.div\s+className=\{\`fixed right-4 bottom-32 z-20 \$\{config\.bg\} backdrop-blur-sm border \$\{config\.border\} rounded-xl px-3 py-2 shadow-lg\`\}\s+initial=\{\{ opacity: 0, y: 10, scale: 0\.95 \}\}\s+animate=\{\{ opacity: 1, y: 0, scale: 1 \}\}\s+transition=\{\{ duration: 0\.3 \}\}\s+layout\s+>/g,
  `<motion.div
      className={\`fixed right-4 bottom-32 z-20 \${config.bg} backdrop-blur-sm border \${config.border} rounded-xl px-3 py-2 shadow-lg cursor-grab active:cursor-grabbing\`}
      initial={{ opacity: 0, y: 10, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.3 }}
      layout
      drag
      dragMomentum={false}
    >`
);

fs.writeFileSync('src/components/RagStatusIndicator.tsx', content);

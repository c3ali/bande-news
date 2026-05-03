async function testSnrt() {
  const methods = [
    { name: "Direct", url: "https://snrtnews.com" },
    { name: "AllOrigins", url: `https://api.allorigins.win/raw?url=${encodeURIComponent("https://snrtnews.com")}` },
    { name: "CodeTabs", url: `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent("https://snrtnews.com")}` },
  ];

  for (const m of methods) {
    console.log(`\n📡 ${m.name}...`);
    try {
      const res = await fetch(m.url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/136.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "ar,en;q=0.9,fr;q=0.5",
        },
      });
      console.log(`   Status: ${res.status}`);
      const text = await res.text();
      console.log(`   Length: ${text.length}`);

      const articleCount = (text.match(/آخر الأخبار/g) || []).length;
      console.log(`   Articles: ${articleCount}`);

      if (text.length > 1000 && !text.includes("Just a moment")) {
        console.log("   ✅ SUCCÈS");
        console.log(`   Aperçu: ${text.substring(0, 200).replace(/\n/g, " ").trim()}...`);
      } else {
        console.log("   ❌ Bloqué ou vide");
      }
    } catch (err) {
      console.log(`   ❌ ${err.message}`);
    }
  }
}

testSnrt().catch(console.error);
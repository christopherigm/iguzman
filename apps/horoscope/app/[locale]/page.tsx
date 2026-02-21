export default async function Home() {
  const features = [
    {
      emoji: '☀️',
      color: '#ffb347',
      bg: '#fff8ee',
      border: '#ffd080',
      title: 'Daily Horoscopes',
      desc: 'Personalized daily guidance tuned to your sign, mood, and current planetary aspects.',
    },
    {
      emoji: '🌙',
      color: '#a0c4ff',
      bg: '#eef6ff',
      border: '#80b4ff',
      title: 'Lunar Calendar',
      desc: 'Track moon phases, eclipses, and ideal days for intention-setting and reflection.',
    },
    {
      emoji: '⭐',
      color: '#c8a0e8',
      bg: '#f5eeff',
      border: '#b888e0',
      title: 'Birthchart',
      desc: 'Explore your natal blueprint with houses, aspects, and planetary placements.',
    },
    {
      emoji: '💕',
      color: '#ff8fab',
      bg: '#fff0f4',
      border: '#ffb3c6',
      title: 'Compatibility',
      desc: 'Understand relationship dynamics across love, friendship, and collaboration.',
    },
    {
      emoji: '🔮',
      color: '#9bb0ff',
      bg: '#eef0ff',
      border: '#8898ff',
      title: 'Forecast',
      desc: 'See short and long-range astrological forecasts to plan with confidence.',
    },
    {
      emoji: '🌿',
      color: '#7ecfa0',
      bg: '#edfff4',
      border: '#60c080',
      title: 'Meditations',
      desc: 'Guided meditations designed around the sky of the day and your inner rhythm.',
    },
    {
      emoji: '✨',
      color: '#f0a0c0',
      bg: '#fff4f8',
      border: '#e888b0',
      title: 'Dreamings',
      desc: 'Capture dreams, decode recurring symbols, and reveal subconscious patterns.',
    },
  ];

  const signs = [
    { sign: '♈', name: 'Aries' },
    { sign: '♉', name: 'Taurus' },
    { sign: '♊', name: 'Gemini' },
    { sign: '♋', name: 'Cancer' },
    { sign: '♌', name: 'Leo' },
    { sign: '♍', name: 'Virgo' },
    { sign: '♎', name: 'Libra' },
    { sign: '♏', name: 'Scorpio' },
    { sign: '♐', name: 'Sagittarius' },
    { sign: '♑', name: 'Capricorn' },
    { sign: '♒', name: 'Aquarius' },
    { sign: '♓', name: 'Pisces' },
  ];

  return (
    <div className="dk">
      {/* Background layers */}
      <div className="dk-orb dk-orb-1" />
      <div className="dk-orb dk-orb-2" />
      <div className="dk-orb dk-orb-3" />

      {/* Sparkle stars */}
      <div className="dk-sparkles">
        {['✦', '✧', '⋆', '✦', '✧', '⋆', '✦', '✧', '⋆', '✦'].map((s, i) => (
          <span key={i} className="dk-spark">
            {s}
          </span>
        ))}
      </div>

      <div className="dk-wrap">
        {/* Top badge */}
        <div className="dk-topbar">
          <div className="dk-badge">
            <span>✨</span>
            <span>Cosmic Intelligence for Every Day</span>
            <span>✨</span>
          </div>
        </div>

        {/* Hero */}
        <div className="dk-hero">
          <h1 className="dk-headline">
            Your Cosmic
            <span className="dk-headline-accent">Best Friend ✨</span>
          </h1>
          <p className="dk-body">
            Personalized guidance, moon timing, compatibility insights, and calm
            daily rituals—delivered with love, for every sign.
          </p>
          <div className="dk-btns">
            <a href={`/`} className="dk-btn-primary">
              ✨ Start My Reading
            </a>
            <a href={`/#features`} className="dk-btn-ghost">
              🌙 Explore Features
            </a>
          </div>
        </div>

        {/* Moon pills */}
        <div className="dk-moon-row">
          {[
            '🌑 New Moon',
            '🌓 First Quarter',
            '🌕 Full Moon',
            '🌗 Last Quarter',
            '☀️ Solar Return',
          ].map((m) => (
            <div key={m} className="dk-moon-pill">
              {m}
            </div>
          ))}
        </div>

        {/* Notification */}
        <div className="dk-notif">
          <div className="dk-notif-text">
            <h3>🔔 Cosmic Notifications</h3>
            <p>Get a gentle reminder when your daily horoscope is ready.</p>
          </div>
          <div className="dk-toggle" />
        </div>

        {/* Features */}
        <div className="dk-section-label">
          <span className="dk-section-title">Your Cosmic Toolkit</span>
          <span className="dk-section-sub">
            Everything you need to live in alignment with the stars ✦
          </span>
        </div>

        <div className="dk-features" id="features">
          {features.map((f) => (
            <div
              key={f.title}
              className="dk-feature"
              style={{
                background: f.bg,
                borderColor: f.border,
                color: f.color,
              }}
            >
              <span className="dk-feature-emoji">{f.emoji}</span>
              <span className="dk-feature-tag">{f.title.split(' ')[0]}</span>
              <h2 className="dk-feature-title">{f.title}</h2>
              <p className="dk-feature-desc">{f.desc}</p>
            </div>
          ))}
        </div>

        {/* Bottom */}
        <div className="dk-bottom">
          <div className="dk-bottom-card">
            <span>🌅</span>
            <h2 className="dk-bottom-title">Your Daily Cosmic Dashboard</h2>
            <p className="dk-bottom-body">
              Start every day with one clear ritual: check your horoscope, align
              with the moon, and set your intention before the noise begins.
            </p>
          </div>
          <div className="dk-bottom-card dk-bottom-card-signs">
            <span style={{ fontSize: '48px', lineHeight: 1 }}>🌙</span>
            <h3
              className="dk-bottom-title"
              style={{ fontSize: '1.5rem', margin: '12px 0 8px' }}
            >
              All 12 Signs
            </h3>
            <p className="dk-bottom-body" style={{ fontSize: '14px' }}>
              Aries to Pisces—personalized guidance for every soul.
            </p>
            <div className="dk-signs-grid">
              {signs.map((s) => (
                <div key={s.sign} className="dk-sign-bubble">
                  <span className="dk-sign-bubble-glyph">{s.sign}</span>
                  <span className="dk-sign-bubble-name">
                    {s.name.slice(0, 3)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

-- Seed data: 20+ realistic Chicago Desi wedding vendor profiles
-- These are pre-seeded profiles that vendors can claim

INSERT INTO public.vendor_profiles (business_name, slug, category, bio, service_area, starting_price_min, starting_price_max, portfolio_images, instagram_handle, website_url, verified, response_sla_hours, total_bookings)
VALUES
  -- Photography
  ('Sharma Studios', 'sharma-studios', 'photography', 'Award-winning South Asian wedding photography team. We capture every emotion, every detail, every moment of your special day. 10+ years experience with Desi weddings across Chicagoland.', ARRAY['Chicago', 'Suburbs'], 250000, 600000, ARRAY[]::TEXT[], 'sharmastudios', 'https://sharmastudios.com', true, 24, 45),

  ('Lens & Light Photography', 'lens-and-light-photography', 'photography', 'Candid and artistic wedding photography. Specializing in mehndi, sangeet, and ceremony coverage. Packages include engagement shoots.', ARRAY['Chicago'], 150000, 400000, ARRAY[]::TEXT[], 'lensandlightchi', NULL, true, 48, 28),

  ('Captured Moments by Riya', 'captured-moments-by-riya', 'photography', 'Solo photographer with a documentary style. I believe in capturing real moments, not posed ones. Perfect for intimate ceremonies.', ARRAY['Chicago', 'Northwest Indiana'], 100000, 250000, ARRAY[]::TEXT[], 'capturedmomentsriya', NULL, false, 48, 12),

  -- Videography
  ('Cinematic Shaadi Films', 'cinematic-shaadi-films', 'videography', 'Cinematic wedding films that tell your love story. Drone footage, same-day edits, and full ceremony coverage. Featured in South Asian Bride Magazine.', ARRAY['Chicago', 'Suburbs'], 300000, 800000, ARRAY[]::TEXT[], 'cinematicshaadi', 'https://cinematicshaadi.com', true, 24, 32),

  ('Reel Dreams Video', 'reel-dreams-video', 'videography', 'Affordable videography packages for South Asian weddings. Highlight reels, full ceremony, and social media teasers.', ARRAY['Chicago'], 150000, 350000, ARRAY[]::TEXT[], 'reeldreamsvideo', NULL, false, 48, 8),

  -- Mehndi / Henna
  ('Mehndi by Priya', 'mehndi-by-priya', 'mehndi', 'Intricate bridal mehndi designs inspired by Rajasthani and Arabic traditions. 500+ brides served. Bridal packages include hands, feet, and arms.', ARRAY['Chicago', 'Suburbs'], 30000, 80000, ARRAY[]::TEXT[], 'mehndibypriya', 'https://mehndibypriya.com', true, 12, 120),

  ('Henna Art Chicago', 'henna-art-chicago', 'mehndi', 'Modern and traditional henna designs. Perfect for mehndi parties, bridal henna, and guest services. Group packages available.', ARRAY['Chicago'], 20000, 50000, ARRAY[]::TEXT[], 'hennaartchi', NULL, true, 24, 65),

  ('Desi Henna Collective', 'desi-henna-collective', 'mehndi', 'Team of 5 henna artists for large mehndi parties. We can serve 50+ guests in one evening. Organic, natural henna only.', ARRAY['Chicago', 'Suburbs', 'Northwest Indiana'], 40000, 120000, ARRAY[]::TEXT[], 'desihennacollective', NULL, false, 36, 30),

  -- Hair & Makeup
  ('Glam by Sana', 'glam-by-sana', 'hair_makeup', 'Bridal hair and makeup artist specializing in South Asian bridal looks. HD airbrush makeup, traditional and modern styles. MAC Pro certified.', ARRAY['Chicago'], 40000, 100000, ARRAY[]::TEXT[], 'glambysana', 'https://glambysana.com', true, 24, 85),

  ('Bollywood Beauty Bar', 'bollywood-beauty-bar', 'hair_makeup', 'Full-service hair and makeup for the entire bridal party. We bring the salon to you. Trials included in all bridal packages.', ARRAY['Chicago', 'Suburbs'], 50000, 150000, ARRAY[]::TEXT[], 'bollywoodbeautybar', NULL, true, 24, 52),

  -- DJ & Music
  ('DJ Raj Entertainment', 'dj-raj-entertainment', 'dj', 'Chicago''s #1 Desi wedding DJ. Bollywood, Bhangra, Top 40, and everything in between. MC services, dhol players, and LED dance floors available.', ARRAY['Chicago', 'Suburbs'], 150000, 350000, ARRAY[]::TEXT[], 'djrajchi', 'https://djrajentertainment.com', true, 12, 200),

  ('Beat Drop DJs', 'beat-drop-djs', 'dj', 'Young and energetic DJ team. We specialize in sangeet and reception entertainment. Wireless mic, subwoofer, and intelligent lighting included.', ARRAY['Chicago'], 80000, 200000, ARRAY[]::TEXT[], 'beatdropdjs', NULL, false, 48, 35),

  ('Dhol Collective Chicago', 'dhol-collective-chicago', 'dj', 'Live dhol players for your baraat, sangeet, or reception. 2-4 dhol players with traditional and fusion beats.', ARRAY['Chicago', 'Suburbs'], 50000, 120000, ARRAY[]::TEXT[], 'dholcollective', NULL, true, 24, 90),

  -- Photo Booth
  ('SnapShot Booth Co.', 'snapshot-booth-co', 'photobooth', 'Modern photo booth rentals with custom backdrops, props, and instant prints. GIF booth, 360 booth, and classic options. Perfect for sangeet and reception.', ARRAY['Chicago', 'Suburbs'], 60000, 150000, ARRAY[]::TEXT[], 'snapshotboothco', 'https://snapshotboothco.com', true, 48, 75),

  ('Desi Photo Booth', 'desi-photo-booth', 'photobooth', 'Culturally themed photo booth with Bollywood props, traditional backdrops, and custom frames. Social media sharing included.', ARRAY['Chicago'], 40000, 80000, ARRAY[]::TEXT[], 'desiphotobooth', NULL, false, 48, 20),

  -- Catering
  ('Spice Route Catering', 'spice-route-catering', 'catering', 'Full-service Indian catering for weddings and events. Vegetarian and non-vegetarian menus. Live chaat stations, tandoor, and dessert bars.', ARRAY['Chicago', 'Suburbs'], 3000, 8000, ARRAY[]::TEXT[], 'spiceroutecatering', 'https://spiceroutecatering.com', true, 48, 40),

  ('Royal Indian Kitchen', 'royal-indian-kitchen', 'catering', 'Premium wedding catering with customizable menus. From street food stations to royal Mughlai spreads. Per-plate pricing.', ARRAY['Chicago'], 4000, 12000, ARRAY[]::TEXT[], 'royalindiankitchen', NULL, true, 48, 25),

  -- Decor
  ('Mandap Magic Decor', 'mandap-magic-decor', 'decor', 'Stunning mandap designs, floral arrangements, and venue decor for South Asian weddings. From minimalist to extravagant. Free consultation.', ARRAY['Chicago', 'Suburbs'], 200000, 800000, ARRAY[]::TEXT[], 'mandapmagicdecor', 'https://mandapmagicdecor.com', true, 48, 30),

  ('Bloom & Drape Events', 'bloom-and-drape-events', 'decor', 'Modern wedding decor with a South Asian touch. Specializing in venue draping, centerpieces, and lighting design.', ARRAY['Chicago'], 100000, 400000, ARRAY[]::TEXT[], 'bloomanddrape', NULL, false, 48, 15),

  -- Invitations
  ('Anarkali Press', 'anarkali-press', 'invitations', 'Custom wedding invitations with traditional and modern designs. Letterpress, foil stamping, and digital options. Multi-event suites for full wedding weekend.', ARRAY['Chicago'], 30000, 100000, ARRAY[]::TEXT[], 'anarkalipress', 'https://anarkalipress.com', true, 48, 50),

  ('Digital Desi Invites', 'digital-desi-invites', 'invitations', 'Eco-friendly digital wedding invitations and websites. Animated e-invites, RSVP tracking, and matching day-of stationery.', ARRAY['Chicago'], 10000, 30000, ARRAY[]::TEXT[], 'digitaldesiinvites', NULL, false, 24, 100),

  -- Venue
  ('Grand Sapphire Banquets', 'grand-sapphire-banquets', 'venue', 'Premier South Asian wedding venue in Schaumburg. Capacity 500+. In-house catering, full bar, and stunning ballroom with crystal chandeliers.', ARRAY['Suburbs'], 500000, 2000000, ARRAY[]::TEXT[], 'grandsapphire', 'https://grandsapphirebanquets.com', true, 48, 60);

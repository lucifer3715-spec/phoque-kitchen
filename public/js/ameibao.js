const CHEF_QUOTES = [
  "阿咩豹系好小围裙啦，今天想翻哪道拿手菜？",
  "先把想吃的菜放进清单，主厨好提前备料～",
  "记菜谱不用一次性写完，拍张照片也能先存着哦！",
  "冰原海风再冷，有热腾腾的炖菜和你们在就很暖～",
  "肚子饿的时候点一点我，我帮你挑一道今日惊喜！",
  "每道做过的菜，阿咩豹都会在私有小库里好好收着。",
  "今天是想吃肉香满满的炖菜，还是清爽快手菜呀？"
];

let quoteIdx = 0;

export function nextAmeibaoQuote() {
  quoteIdx = (quoteIdx + 1) % CHEF_QUOTES.length;
  return CHEF_QUOTES[quoteIdx];
}

function renderBaseSealSvg({ mood = "stand", size = 120, className = "" } = {}) {
  const isPeek = mood === "peek";
  const isRoll = mood === "bellyRoll";
  const isHappy = mood === "happyFed" || mood === "bellyRoll" || mood === "dice";
  const isEmpty = mood === "empty";
  const isCooking = mood === "cooking";
  const isSleepy = mood === "sleepy";

  if (isPeek) {
    return `
      <svg class="ameibao-svg ameibao-mood-peek ${className}" width="${size}" height="${Math.round(size * 0.74)}" viewBox="0 0 200 148" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <defs>
          <radialGradient id="sealFurPeek" cx="50%" cy="35%" r="65%">
            <stop offset="0%" stop-color="#FFFFFF"/>
            <stop offset="75%" stop-color="#FFFDF8"/>
            <stop offset="100%" stop-color="#E5F0F9"/>
          </radialGradient>
          <linearGradient id="apronBluePeek" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="#87BEE7"/>
            <stop offset="100%" stop-color="#5C98C8"/>
          </linearGradient>
        </defs>

        <!-- Floating bubbles -->
        <circle class="ameibao-bubble b1" cx="28" cy="48" r="5" fill="#DFF0FC" fill-opacity="0.85" stroke="#FFFFFF" stroke-width="1.5"/>
        <circle class="ameibao-bubble b2" cx="174" cy="36" r="4" fill="#DFF0FC" fill-opacity="0.85" stroke="#FFFFFF" stroke-width="1.4"/>
        <circle class="ameibao-bubble b3" cx="164" cy="58" r="2.6" fill="#FFFFFF" fill-opacity="0.9"/>

        <!-- Chef hat -->
        <g class="ameibao-hat" transform="rotate(-4 100 50)">
          <path d="M68 48 C56 44, 54 24, 70 20 C75 9, 94 7, 102 15 C112 7, 129 10, 132 21 C147 25, 144 45, 132 48 Z" fill="#FFFFFF" stroke="#5A4B40" stroke-width="2.8" stroke-linejoin="round"/>
          <path d="M84 23 C85 31, 85 38, 84 44 M101 19 C101 29, 101 37, 101 44 M117 23 C116 31, 116 38, 117 44" stroke="#DCE8F2" stroke-width="2" stroke-linecap="round"/>
          <rect x="68" y="43" width="64" height="14" rx="5" fill="#6BA5D4" stroke="#5A4B40" stroke-width="2.6"/>
          <circle cx="121" cy="50" r="3.4" fill="#F7C76B" stroke="#5A4B40" stroke-width="1.4"/>
        </g>

        <!-- Plump head & upper body peeking over ledge -->
        <path d="M40 132 C37 86, 56 54, 100 54 C144 54, 163 86, 160 132 Z" fill="url(#sealFurPeek)" stroke="#5A4B40" stroke-width="3" stroke-linejoin="round"/>
        <!-- Fluffy cheek tufts -->
        <path d="M41 96 Q33 98 39 105 M159 96 Q167 98 161 105" stroke="#5A4B40" stroke-width="2.6" stroke-linecap="round"/>

        <!-- Baby-blue apron top -->
        <path d="M72 119 L128 119 L134 138 L66 138 Z" fill="url(#apronBluePeek)" stroke="#5A4B40" stroke-width="2.4" stroke-linejoin="round"/>
        <path d="M75 119 C78 106, 84 103, 88 105 M125 119 C122 106, 116 103, 112 105" stroke="#5A4B40" stroke-width="2.2" stroke-linecap="round"/>
        <!-- Tiny heart embroidered on apron -->
        <path d="M100 133 C97 130, 94 128, 94 125.5 C94 124, 95.3 122.8, 96.8 122.8 C98.2 122.8, 99.3 123.7, 100 124.8 C100.7 123.7, 101.8 122.8, 103.2 122.8 C104.7 122.8, 106 124, 106 125.5 C106 128, 103 130, 100 133 Z" fill="#FFF7EE"/>

        <!-- Blush -->
        <ellipse cx="64" cy="98" rx="9" ry="5.2" fill="#F7A7A0" fill-opacity="0.65"/>
        <ellipse cx="136" cy="98" rx="9" ry="5.2" fill="#F7A7A0" fill-opacity="0.65"/>

        <!-- Glossy Harp Seal Eyes -->
        <g class="ameibao-eyes">
          <circle cx="77" cy="85" r="9.2" fill="#2A1F1A"/>
          <circle cx="74" cy="81.6" r="3.3" fill="#FFFFFF"/>
          <circle cx="80.5" cy="88.5" r="1.5" fill="#FFFFFF"/>

          <circle cx="123" cy="85" r="9.2" fill="#2A1F1A"/>
          <circle cx="120" cy="81.6" r="3.3" fill="#FFFFFF"/>
          <circle cx="126.5" cy="88.5" r="1.5" fill="#FFFFFF"/>
        </g>

        <!-- Nose & :3 mouth & whiskers -->
        <ellipse cx="100" cy="95" rx="5.2" ry="3.8" fill="#2A1F1A"/>
        <ellipse cx="98.6" cy="93.8" rx="1.5" ry="0.9" fill="#FFFFFF" fill-opacity="0.7"/>
        <path d="M92 101 Q96 106 100 101 Q104 106 108 101" stroke="#4D3D33" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
        <path d="M55 92 L45 89 M54 97 L43 97 M145 92 L155 89 M146 97 L157 97" stroke="#8F7D70" stroke-width="1.6" stroke-linecap="round"/>

        <!-- Front flippers resting on ledge -->
        <g class="ameibao-paw-left">
          <ellipse cx="52" cy="129" rx="16" ry="10" transform="rotate(-12 52 129)" fill="#FFFFFF" stroke="#5A4B40" stroke-width="2.8"/>
          <path d="M44 129 L48 133 M50 127 L54 132" stroke="#9D8C80" stroke-width="1.5" stroke-linecap="round"/>
        </g>
        <g class="ameibao-paw-right">
          <ellipse cx="148" cy="129" rx="16" ry="10" transform="rotate(12 148 129)" fill="#FFFFFF" stroke="#5A4B40" stroke-width="2.8"/>
          <path d="M156 129 L152 133 M150 127 L146 132" stroke="#9D8C80" stroke-width="1.5" stroke-linecap="round"/>
        </g>
      </svg>
    `;
  }

  if (isRoll) {
    return `
      <svg class="ameibao-svg ameibao-mood-roll ${className}" width="${size}" height="${size}" viewBox="0 0 220 210" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <defs>
          <radialGradient id="sealFurRoll" cx="45%" cy="40%" r="65%">
            <stop offset="0%" stop-color="#FFFFFF"/>
            <stop offset="78%" stop-color="#FFFDF8"/>
            <stop offset="100%" stop-color="#E4EFF8"/>
          </radialGradient>
          <linearGradient id="apronBlueRoll" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#8BC1E9"/>
            <stop offset="100%" stop-color="#5B97C7"/>
          </linearGradient>
        </defs>

        <!-- Floating hearts & sparkles -->
        <path class="ameibao-heart h1" d="M44 58 C38 51, 28 53, 28 61 C28 69, 44 77, 44 77 C44 77, 60 69, 60 61 C60 53, 50 51, 44 58 Z" fill="#F07B78"/>
        <path class="ameibao-heart h2" d="M180 48 C175 42, 166 44, 166 51 C166 58, 180 65, 180 65 C180 65, 194 58, 194 51 C194 44, 185 42, 180 48 Z" fill="#F59B95"/>
        <path class="ameibao-sparkle s1" d="M110 18 L113 26 L121 29 L113 32 L110 40 L107 32 L99 29 L107 26 Z" fill="#F6C45B"/>

        <!-- Soft floor shadow -->
        <ellipse cx="110" cy="186" rx="68" ry="11" fill="#C7B6A2" fill-opacity="0.32"/>

        <!-- Rolling seal group -->
        <g class="ameibao-roll-body">
          <!-- Cute little kicked-up tail flippers -->
          <path d="M158 145 C182 135, 194 147, 184 159 C194 166, 184 179, 162 166 Z" fill="#FFFFFF" stroke="#5A4B40" stroke-width="3" stroke-linejoin="round"/>

          <!-- Chubby bean body lying belly-up -->
          <path d="M48 118 C44 76, 74 52, 108 55 C135 57, 166 78, 174 116 C181 150, 152 175, 108 175 C64 175, 51 150, 48 118 Z" fill="url(#sealFurRoll)" stroke="#5A4B40" stroke-width="3.2" stroke-linejoin="round"/>

          <!-- Chef hat bouncing slightly off to the left -->
          <g transform="rotate(-18 76 58)">
            <path d="M52 56 C41 52, 40 34, 54 31 C58 21, 75 19, 82 27 C91 20, 106 23, 108 33 C121 37, 118 53, 106 56 Z" fill="#FFFFFF" stroke="#5A4B40" stroke-width="2.8" stroke-linejoin="round"/>
            <rect x="52" y="51" width="54" height="12" rx="4.5" fill="#6BA5D4" stroke="#5A4B40" stroke-width="2.5"/>
          </g>

          <!-- Baby-blue apron wrapped across round belly -->
          <path d="M77 118 C92 112, 128 112, 144 120 C150 138, 146 161, 134 168 C116 173, 94 173, 76 165 C70 150, 71 134, 77 118 Z" fill="url(#apronBlueRoll)" stroke="#5A4B40" stroke-width="2.8" stroke-linejoin="round"/>
          <!-- Apron pocket + heart -->
          <path d="M92 141 L128 141 C129 154, 122 162, 110 162 C98 162, 91 154, 92 141 Z" fill="#EBF5FC" stroke="#5A4B40" stroke-width="2.2"/>
          <path d="M110 156 C106 152, 103 150, 103 147.2 C103 145.6, 104.3 144.4, 105.9 144.4 C107.4 144.4, 108.9 145.3, 110 146.7 C111.1 145.3, 112.6 144.4, 114.1 144.4 C115.7 144.4, 117 145.6, 117 147.2 C117 150, 114 152, 110 156 Z" fill="#F07B78"/>

          <!-- Happy curved ^ ^ eyes & rosy blush -->
          <ellipse cx="75" cy="95" rx="8.5" ry="5" fill="#F7A7A0" fill-opacity="0.72"/>
          <ellipse cx="129" cy="92" rx="8.5" ry="5" fill="#F7A7A0" fill-opacity="0.72"/>
          <path d="M77 83 Q84 74 91 83" stroke="#2A1F1A" stroke-width="3.6" stroke-linecap="round" fill="none"/>
          <path d="M111 81 Q118 72 125 81" stroke="#2A1F1A" stroke-width="3.6" stroke-linecap="round" fill="none"/>
          <ellipse cx="101" cy="90" rx="5" ry="3.5" fill="#2A1F1A"/>
          <path d="M93 96 Q97 101 101 96 Q105 101 109 96" stroke="#4D3D33" stroke-width="2.4" stroke-linecap="round" fill="none"/>

          <!-- Front flippers clapping happily -->
          <ellipse class="ameibao-flipper-l" cx="56" cy="126" rx="18" ry="10.5" transform="rotate(-32 56 126)" fill="#FFFFFF" stroke="#5A4B40" stroke-width="2.8"/>
          <ellipse class="ameibao-flipper-r" cx="154" cy="122" rx="18" ry="10.5" transform="rotate(28 154 122)" fill="#FFFFFF" stroke="#5A4B40" stroke-width="2.8"/>
        </g>
      </svg>
    `;
  }

  const tilt = isEmpty ? 'transform="rotate(-6 100 105)"' : "";
  return `
    <svg class="ameibao-svg ameibao-mood-${mood} ${className}" width="${size}" height="${size}" viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <radialGradient id="sealFurMain" cx="48%" cy="34%" r="65%">
          <stop offset="0%" stop-color="#FFFFFF"/>
          <stop offset="76%" stop-color="#FFFDF8"/>
          <stop offset="100%" stop-color="#E4EFF8"/>
        </radialGradient>
        <linearGradient id="apronBlueMain" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#87BEE7"/>
          <stop offset="100%" stop-color="#5B97C7"/>
        </linearGradient>
      </defs>

      <!-- Soft ground shadow -->
      <ellipse cx="100" cy="181" rx="56" ry="10" fill="#C7B6A2" fill-opacity="0.3"/>

      <g ${tilt}>
        <!-- Little side tail fin -->
        <path d="M146 154 C168 148, 178 158, 169 167 C176 174, 166 182, 145 170 Z" fill="#FFFFFF" stroke="#5A4B40" stroke-width="2.8" stroke-linejoin="round"/>

        <!-- Plump body -->
        <path d="M44 134 C41 88, 60 56, 100 56 C140 56, 159 88, 156 134 C154 166, 134 177, 100 177 C66 177, 46 166, 44 134 Z" fill="url(#sealFurMain)" stroke="#5A4B40" stroke-width="3" stroke-linejoin="round"/>
        <path d="M44 98 Q36 101 42 108 M156 98 Q164 101 158 108" stroke="#5A4B40" stroke-width="2.5" stroke-linecap="round"/>

        <!-- Chef hat -->
        <g class="ameibao-hat" transform="rotate(-5 100 45)">
          <path d="M67 48 C55 44, 53 23, 69 20 C74 9, 93 7, 101 15 C111 7, 128 10, 131 21 C146 25, 143 45, 131 48 Z" fill="#FFFFFF" stroke="#5A4B40" stroke-width="2.8" stroke-linejoin="round"/>
          <path d="M84 22 C85 30, 85 37, 84 43 M101 18 C101 28, 101 36, 101 43 M117 22 C116 30, 116 37, 117 43" stroke="#DCE8F2" stroke-width="2" stroke-linecap="round"/>
          <rect x="67" y="43" width="64" height="14" rx="5" fill="#6BA5D4" stroke="#5A4B40" stroke-width="2.6"/>
          <circle cx="121" cy="50" r="3.4" fill="#F7C76B" stroke="#5A4B40" stroke-width="1.4"/>
        </g>

        <!-- Baby-blue apron -->
        <path d="M66 123 L134 123 L141 169 C128 175, 72 175, 59 169 Z" fill="url(#apronBlueMain)" stroke="#5A4B40" stroke-width="2.6" stroke-linejoin="round"/>
        <path d="M70 123 C74 108, 82 106, 86 108 M130 123 C126 108, 118 106, 114 108" stroke="#5A4B40" stroke-width="2.2" stroke-linecap="round"/>
        <path d="M84 143 L116 143 C117 155, 111 163, 100 163 C89 163, 83 155, 84 143 Z" fill="#EBF5FC" stroke="#5A4B40" stroke-width="2"/>
        <path d="M100 157 C97 154, 94 152, 94 149.5 C94 148, 95.3 146.8, 96.8 146.8 C98.2 146.8, 99.3 147.7, 100 148.8 C100.7 147.7, 101.8 146.8, 103.2 146.8 C104.7 146.8, 106 148, 106 149.5 C106 152, 103 154, 100 157 Z" fill="#F07B78"/>

        <!-- Blush -->
        <ellipse cx="64" cy="99" rx="8.8" ry="5" fill="#F7A7A0" fill-opacity="0.65"/>
        <ellipse cx="136" cy="99" rx="8.8" ry="5" fill="#F7A7A0" fill-opacity="0.65"/>

        <!-- Eyes -->
        ${
          isHappy
            ? `
              <path d="M68 87 Q76 78 84 87" stroke="#2A1F1A" stroke-width="3.4" stroke-linecap="round" fill="none"/>
              <path d="M116 87 Q124 78 132 87" stroke="#2A1F1A" stroke-width="3.4" stroke-linecap="round" fill="none"/>
            `
            : isSleepy
              ? `
                <path d="M68 86 Q76 92 84 86" stroke="#2A1F1A" stroke-width="3" stroke-linecap="round" fill="none"/>
                <path d="M116 86 Q124 92 132 86" stroke="#2A1F1A" stroke-width="3" stroke-linecap="round" fill="none"/>
                <text x="150" y="64" fill="#689BC4" font-size="16" font-weight="700">Z</text>
                <text x="163" y="52" fill="#8BB7DA" font-size="12" font-weight="700">z</text>
              `
              : `
                <g class="ameibao-eyes">
                  <circle cx="77" cy="86" r="9.2" fill="#2A1F1A"/>
                  <circle cx="74" cy="82.6" r="3.3" fill="#FFFFFF"/>
                  <circle cx="80.5" cy="89.5" r="1.5" fill="#FFFFFF"/>
                  <circle cx="123" cy="86" r="9.2" fill="#2A1F1A"/>
                  <circle cx="120" cy="82.6" r="3.3" fill="#FFFFFF"/>
                  <circle cx="126.5" cy="89.5" r="1.5" fill="#FFFFFF"/>
                </g>
              `
        }

        <!-- Nose & mouth & whiskers -->
        <ellipse cx="100" cy="96" rx="5" ry="3.6" fill="#2A1F1A"/>
        <ellipse cx="98.6" cy="94.9" rx="1.4" ry="0.9" fill="#FFFFFF" fill-opacity="0.7"/>
        <path d="M92 102 Q96 107 100 102 Q104 107 108 102" stroke="#4D3D33" stroke-width="2.4" stroke-linecap="round" fill="none"/>
        <path d="M56 93 L45 90 M55 98 L44 98 M144 93 L155 90 M145 98 L156 98" stroke="#8F7D70" stroke-width="1.6" stroke-linecap="round"/>

        <!-- Wooden spoon prop for cooking / stand -->
        ${
          isCooking || mood === "stand"
            ? `
              <g class="ameibao-spoon" transform="rotate(20 150 120)">
                <rect x="148" y="102" width="5.5" height="44" rx="2.7" fill="#D59B5A" stroke="#5A4B40" stroke-width="2"/>
                <ellipse cx="150.7" cy="96" rx="9" ry="12" fill="#E3AD6D" stroke="#5A4B40" stroke-width="2.2"/>
              </g>
            `
            : ""
        }

        <!-- Bowl prop when empty or happyFed -->
        ${
          isEmpty || mood === "happyFed"
            ? `
              <g transform="translate(0, 4)">
                <path d="M74 148 L126 148 C124 166, 114 172, 100 172 C86 172, 76 166, 74 148 Z" fill="#FFF4DF" stroke="#5A4B40" stroke-width="2.4"/>
                <ellipse cx="100" cy="148" rx="26" ry="5.5" fill="${mood === "happyFed" ? "#F2A865" : "#F3E4CE"}" stroke="#5A4B40" stroke-width="2.2"/>
              </g>
            `
            : ""
        }

        <!-- Flippers -->
        <ellipse cx="48" cy="136" rx="16" ry="10" transform="rotate(-24 48 136)" fill="#FFFFFF" stroke="#5A4B40" stroke-width="2.8"/>
        <ellipse cx="152" cy="136" rx="16" ry="10" transform="rotate(24 152 136)" fill="#FFFFFF" stroke="#5A4B40" stroke-width="2.8"/>
      </g>
    </svg>
  `;
}

export function renderAmeibao(container, options = {}) {
  if (!container) return;
  container.innerHTML = renderBaseSealSvg(options);
}

export function getAmeibaoSvg(options = {}) {
  return renderBaseSealSvg(options);
}

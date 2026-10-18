# 🔮 Liquid Glass Redi (LGR)
> **Bahasa Pemrograman & Engine Grafis Mandiri Pertama Berbasis Fisika Optik Sejati & Mekanika Fluida**  
> *Melampaui teknologi Apple visionOS & iOS 26 tanpa keterikatan pada MacOS, tanpa chip Apple Silicon, dan tanpa ketergantungan pada CSS/DOM.*

---

## 🌟 Apa Itu LGR (Liquid Glass Redi)?

**LGR** adalah bahasa pemrograman deklaratif fisika dan engine render hardware yang diciptakan untuk menghasilkan efek **Liquid Crystal Glass** fotorealistik secara real-time (60–120 FPS) langsung di GPU.

LGR tidak menumpang pada aturan kaku CSS atau HTML, melainkan mengompilasi kode sumber berkas `.lgr` menjadi instruksi seragam GPU (*GPU Uniforms & Hardware Shaders*) yang mematuhi hukum fisika alam semesta:

1. **Hukum Snellius & Dispersi Spektral Cauchy ($n(\lambda) = A + B/\lambda^2$)**:
   Memecah refraksi menjadi 3 panjang gelombang ($\lambda_R = 650\text{nm}, \lambda_G = 550\text{nm}, \lambda_B = 450\text{nm}$), menghasilkan kilauan pelangi mikro prismatik mewah di tepi meniskus kaca yang tidak dimiliki oleh Apple.
2. **Kekekalan Volume Fluida Navier-Stokes (Bilangan Weber $We$)**:
   Tetesan cairan kaca melar searah laju luncuran ($S_x = \sqrt{1 + 0.28 We}$) dan otomatis mengempis pada sumbu tegak lurus ($S_y = 1 / \sqrt{1 + 0.14 We}$) agar massanya tetap konstan.
3. **Tegangan Permukaan Marangoni & Koalesensi Tetesan (*Metaballs*)**:
   Dua tetesan cairan kaca yang berdekatan dapat saling menarik, membentuk leher cairan elastis (*liquid necking*), dan menyatu tanpa garis sambungan.
4. **Hukum Kontras Bifasik & Riak Air Kapiler LGR**:
   Memecahkan masalah *Contrast Collapse* pada latar belakang terang (seperti warna Krem `#F5EBE1`) dengan memasangkan **Puncak Putih Berlian (`#FFFFFF`)** dan **Lembah Refraksi Beer-Lambert (*Warm Champagne-Amber*)**.
5. **Invarian Keseimbangan 1:1 saat Diam**:
   Saat berhenti di atas menu, pembesaran terkunci tepat di `1.0000x` dan offset `0.0px` (sejajar sempurna tanpa pergeseran baseline).

---

## 📂 Struktur Repositori

```
liquid-glass-redi/
├── compiler/               # Rangkaian Compiler Mandiri (lgrc)
│   ├── lexer.js            # Tokenizer dengan satuan fisika (px, deg, nm, ior, s)
│   ├── parser.js           # Recursive Descent Parser menghasilkan AST
│   ├── analyzer.js         # Semantic & Physics Analyzer (Cauchy, Fresnel, RK4)
│   ├── codegen.js          # Generator Shader Hardware GLSL & Bundel IR
│   └── lgrc.js             # CLI & Programmatic Compiler Runner
├── physics/                # Mesin Fisika Fluida Hydro-Optical
│   └── hydroEngine.js      # Integrator RK4 Orde-4, Weber Solver, & Marangoni
├── shaders/                # Kernel Optik Hardware GPU
│   └── opticalKernel.js    # Shader GLSL Multi-Pass Framebuffer Refraction
├── lab/                    # Laboratorium Visual Interaktif
│   └── index.html          # Workbench 120 FPS dengan Live .lgr Compiler
├── examples/               # Contoh Kode Sumber Bahasa LGR
│   └── crystal_redi.lgr    # Material CrownCrystalRedi & DiamondPrismRedi
├── build/                  # Artefak Kompilasi Biner/JSON IR & GLSL
├── serve-lab.js            # Server Lokal Laboratorium LGR
├── test-suite.js           # Rangkaian Pengujian Verifikasi Fisika Otomatis
├── LGR_LANGUAGE_SPEC.md    # Spesifikasi Tata Bahasa Formal EBNF (.lgr)
├── LGR_MASTER_PLAN.md      # Peta Jalan Rekayasa Bertahap
└── LGR_RESEARCH_MASTER.md  # Bedah Komparatif Struktur Apple vs LGR
```

---

## 🚀 Memulai (Quick Start)

### 1. Kompilasi Kode Sumber `.lgr`
Jalankan compiler `lgrc` untuk mengompilasi file `.lgr` menjadi shader GPU dan artefak IR:
```bash
node compiler/lgrc.js examples/crystal_redi.lgr
```

### 2. Jalankan Pengujian Fisika
Verifikasi hukum kekekalan volume Weber, pemantulan Fresnel, dan invarian 1:1:
```bash
npm test
```

### 3. Jalankan Laboratorium Visual Interaktif
Buka workbench optik di browser pada `http://localhost:4321/lab/index.html`:
```bash
npm start
```

---

## 📝 Contoh Sintaks Bahasa `.lgr`

```lgr
material CrownCrystalRedi {
    optics {
        refractiveIndex: 1.52ior;
        cauchyDispersion: 0.0052;
        wavelengths: spectrum(650nm, 550nm, 450nm);
        meniscusRimWidth: 9.2px;
        totalInternalReflection: true;
    }

    fluid {
        incompressibility: true;
        weberStretchX: 0.28;
        weberCompressY: 0.14;
        characteristicVelocity: 1180px;
        marangoniRadius: 20px;
        dampingRatio: 0.88;
        responseTime: 0.36s;
    }

    lighting {
        keyLightExp: 54.0;
        crownShelfExp: 14.0;
        bottomRimBounceExp: 34.0;
        bernoulliGlintExp: 22.0;
        tintColor: #FFFDF8;
        accentColor: #D97706;
    }

    caustics {
        mode: analytical_jacobian;
        intensity: 0.38;
        focusHeight: 2.5px;
    }
}
```

---

## 📄 Lisensi

Proyek ini dirilis di bawah lisensi [MIT](LICENSE). Diciptakan dan dikembangkan oleh **Redilah**.

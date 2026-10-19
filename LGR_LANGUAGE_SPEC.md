# SPESIFIKASI FORMAL BAHASA PEMROGRAMAN LGR (`.lgr`)
> **Versi Spesifikasi:** 1.0.0 ("Crystal Genesis")  
> **Ekstensi Berkas:** `.lgr` (Liquid Glass Redi Source)  
> **Compiler Resmi:** `lgrc` (Liquid Glass Redi Compiler)

---

## 1. Filosofi Desain Bahasa `.lgr`

Bahasa **LGR** dirancang sebagai **Bahasa Deklaratif Fisika Optik & Fluida (*First-Principles Optical-Fluid Language*)**. Berbeda dengan CSS yang memanipulasi kotak datar 2D, setiap deklarasi di dalam `.lgr` mendefinisikan **benda fisik 3D nyata** yang memiliki:
- **Sifat Optik Material**: Indeks bias ($n$), dispersi kromatik Cauchy ($B$), reflektansi Fresnel ($F_0$), dan fokus kausik lantai dasar.
- **Sifat Mekanika Fluida**: Tegangan permukaan Marangoni, viskositas geser, kekekalan volume Navier-Stokes (Bilangan Weber $We$), dan jari-jari penyatuan tetesan (*metaball coalescence*).
- **Sifat Pencahayaan Studio PBR**: 4 sumber cahaya spekular dinamis yang berinteraksi dengan kemiringan permukaan cairan.

---

## 2. Struktur Leksikal & Tipe Data Fisik

### 2.1. Komentar
- Komentar satu baris: `// komentar`
- Komentar blok: `/* komentar multi-baris */`

### 2.2. Satuan Fisika Native (First-Class Physical Units)
Dalam bahasa `.lgr`, angka dapat ditulis langsung bersama satuan fisikanya tanpa tanda kutip:
| Kategori | Satuan | Contoh di `.lgr` | Makna Fisika |
| :--- | :--- | :--- | :--- |
| **Dimensi Ruang** | `px`, `%` | `380px`, `50%` | Koordinat piksel layar atau rasio relatif |
| **Sudut Optik/Geser** | `deg`, `rad` | `2.6deg`, `0.045rad` | Sudut kemiringan inersia & batas refraksi |
| **Spektrum Cahaya** | `nm` | `650nm`, `550nm`, `450nm` | Panjang gelombang elektromagnetik ($\lambda$) |
| **Indeks Bias** | `ior` | `1.52ior`, `2.42ior` | Rasio kecepatan cahaya di vakum terhadap medium |
| **Waktu / Respons** | `ms`, `s` | `350ms`, `0.38s` | Periode respons pegas teredam kritis |

### 2.3. Vektor & Warna Optik
- **Warna Heksadesimal**: `#FFFFFF`, `#F7EEE2`, `#D97706FF`
- **Konstruktor Vektor**:
  - `vec2(x, y)`
  - `vec3(x, y, z)`
  - `rgba(r, g, b, a)`
  - `spectrum(red_nm, green_nm, blue_nm)`

---

## 3. Tata Bahasa (EBNF Grammar)

```ebnf
Program        ::= Statement*
Statement      ::= MaterialDecl | SceneDecl
MaterialDecl   ::= "material" Identifier "{" BlockBody "}"
SceneDecl      ::= "scene" Identifier "{" BlockBody "}"
BlockBody      ::= (PropertyAssign | SubBlock)*
SubBlock       ::= BlockType Identifier? "{" BlockBody "}"
BlockType      ::= "optics" | "fluid" | "lighting" | "caustics" 
                 | "vessel" | "droplet" | "invariant" | "interaction"
PropertyAssign ::= Identifier ":" Expression ";"
Expression     ::= NumberWithUnit | String | Boolean | HexColor | FunctionCall | Identifier
FunctionCall   ::= Identifier "(" ArgumentList? ")"
```

---

## 4. Blok Semantik Utama & Hukum Fisika Bawaan

### 4.1. Blok `material <Nama>`
Mendefinisikan konstanta fisika kaca cair:
```lgr
material CrownCrystalRedi {
    optics {
        refractiveIndex: 1.52ior;         // Indeks bias dasar (Hijau 550nm)
        cauchyDispersion: 0.0048;         // Konstanta dispersi kromatik Cauchy B (um^2)
        wavelengths: spectrum(650nm, 550nm, 450nm);
        meniscusRimWidth: 9.2px;
        totalInternalReflection: true;    // Aktifkan pantulan kritis tepi kaca
    }

    fluid {
        incompressibility: true;          // Paksa det(J) = 1.0 (Kekekalan Volume)
        weberStretchX: 0.28;              // Sx = sqrt(1 + 0.28 * We)
        weberCompressY: 0.14;             // Sy = 1 / sqrt(1 + 0.14 * We)
        characteristicVelocity: 1180px;   // Kecepatan acuan tanh(|vx| / v_char)
        marangoniRadius: 18px;            // Jarak tarik-menarik penyatuan 2 tetesan (Metaball)
        dampingRatio: 1.0;                // 1.0 = Critically Damped, 0.8 = Elastic Flick
        responseTime: 0.36s;              // Respons pegas harmonik
    }

    lighting {
        keyLightExp: 54.0;
        crownShelfExp: 14.0;
        bottomRimBounceExp: 34.0;
        bernoulliGlintExp: 22.0;
        tintColor: #FFFDF9;
        accentColor: #D97706;
    }

    caustics {
        mode: analytical_jacobian;        // Fokus sinar nyata (melampaui gradien statis Apple)
        intensity: 0.34;
        focusHeight: 2.5px;
    }
}
```

### 4.2. Blok `scene <Nama>`
Mendefinisikan ruang kanvas mandiri, wadah kaca (*vessel*), dan tetesan lensa aktif (*droplet*):
```lgr
scene CassielNavigation {
    resolution: vec2(380px, 62px);
    useMaterial: CrownCrystalRedi;

    invariant {
        restingScale: 1.0000;             // Wajib 1:1 saat diam (Zero Baseline Drift)
        restingLiftY: 0.0px;
        maxDynamicZoom: 1.18;             // Zoom maksimum saat membal / meluncur
        clipGeometry: capsule_exact;      // Anti-bleed kapsul murni
    }

    vessel MainDock {
        shape: capsule(380px, 62px);
        baseColor: #F7EEE2;
        bevelStrength: 0.30;
    }

    droplet ActiveLens {
        shape: capsule(72px, 48px);
        initialPos: vec2(64px, 31px);
        coalescence: enabled;             // Dapat menyatu dengan tetesan lain
    }
}
```

---

## 5. Komputasi Otomatis saat Compile-Time (`lgrc` Semantic Pass)

Saat `lgrc` mengompilasi file `.lgr`, compiler secara otomatis menghitung parameter turunan fisika agar GPU tidak membuang siklus komputasi:
1. **Rasio Dispersi Spektral Cauchy ($\eta_R, \eta_G, \eta_B$)**:
   $$\eta(\lambda) = \frac{n_{\text{udara}}}{n_0 + B \cdot \left(\frac{1}{\lambda^2} - \frac{1}{\lambda_G^2}\right)}$$
2. **Koefisien Reflektansi Normal Fresnel ($F_0$)**:
   $$F_0 = \left(\frac{1.0 - n_0}{1.0 + n_0}\right)^2$$
3. **Sudut Kritis Pantulan Internal Total ($\theta_{\text{crit}}$)**:
   $$\theta_{\text{crit}} = \arcsin\left(\frac{1.0}{n_0}\right)$$
4. **Parameter Diferensial Pegas Orde-2 ($\omega_n, k, c$)**:
   $$\omega_n = \frac{2\pi}{T_{\text{response}}}, \quad k = \omega_n^2, \quad c = 2 \zeta \omega_n$$
5. **Defleksi Pembiasan Optik Framebuffer Snellius ($\kappa_R, \kappa_G, \kappa_B, \Delta \vec{p}$)**:
   $$\Delta \vec{p}(\lambda) = d_0 \cdot \left(\frac{n_{\text{air}} - n_{\text{glass}}(\lambda)}{n_{\text{glass}}(\lambda)}\right) \nabla z(x,y) = d_0 \cdot (\eta(\lambda) - 1.0) \nabla z(x,y)$$
   Di mana $\kappa(\lambda) = \eta(\lambda) - 1.0 = \frac{1 - n(\lambda)}{n(\lambda)}$.
   Pada saat istirahat (*resting state*), $\nabla z \to 0$ pada pusat lensa sehingga $\Delta \vec{p} \equiv 0$ (Invarian 1:1, tipografi di balik kaca tajam 100% tanpa distorsi kabur).


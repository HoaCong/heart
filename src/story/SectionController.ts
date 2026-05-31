/**
 * SectionController
 *
 * Manages the HTML UI overlay — section titles, subtitles, number labels.
 * Driven by TimelineController; uses GSAP for smooth fade/slide transitions.
 * All DOM mutations happen here — the rest of the system is Three.js only.
 */

import { gsap } from "gsap";

interface SectionMeta {
  number: string;
  title: string;
  subtitle: string;
}

const SECTIONS: SectionMeta[] = [
  {
    number: "01",
    title: "Khoảng Lặng Bình Yên",
    subtitle:
      "Bước đi một mình chưa bao giờ là nỗi cô đơn, mà là vùng trời bình yên em tự chọn — cất giữ thanh xuân chờ một nhịp đập thực sự đồng điệu.",
  },
  {
    number: "02",
    title: "Sự Trầm Mặc Dịu Dàng",
    subtitle:
      "Và ở một góc thế giới, anh cũng khép mình ôm lấy những thinh lặng an yên — giữ lại một khoảng trống vẹn nguyên chỉ đợi duy nhất một người bước tới.",
  },
  {
    number: "03",
    title: "Điểm Chạm Định Mệnh",
    subtitle:
      "Chẳng ai ngờ một ánh nhìn thoáng qua trên TikTok lại là sự bài trí của duyên phận. Sợi chỉ vô hình đã khéo léo buộc hai đường thẳng xa lạ cuộn vào chung một quỹ đạo.",
  },
  {
    number: "04",
    title: "Vun Đắp Nét Hoàn Mỹ",
    subtitle:
      "Đi qua giông bão mới thấu cảm, ta vốn không tìm kiếm một tình yêu hoàn hảo. Ta cứ đến với nhau đầy khuyết khiếm, dùng chở che và bao dung để tự đắp xây một bến đỗ vẹn toàn.",
  },
];

export class SectionController {
  private readonly numberEl: HTMLElement;
  private readonly titleEl: HTMLElement;
  private readonly subtitleEl: HTMLElement;
  private readonly hintEl: HTMLElement;
  private readonly loaderEl: HTMLElement;

  private currentIndex = -1;

  constructor() {
    this.numberEl = document.getElementById("section-number")!;
    this.titleEl = document.getElementById("section-title")!;
    this.subtitleEl = document.getElementById("section-subtitle")!;
    this.hintEl = document.getElementById("scroll-hint")!;
    this.loaderEl = document.getElementById("loader")!;
  }

  /** Hide the loading screen with a smooth fade. */
  hideLoader(): void {
    gsap.to(this.loaderEl, {
      opacity: 0,
      duration: 1.2,
      ease: "power2.inOut",
      onComplete: () => {
        this.loaderEl.style.display = "none";
      },
    });

    // Fade in scroll hint after loader disappears
    gsap.fromTo(
      this.hintEl,
      { opacity: 0, y: 16 },
      { opacity: 1, y: 0, duration: 1, delay: 1.5, ease: "power2.out" },
    );
  }

  /**
   * Update displayed section.
   * @param sectionIndex 0-3 matching SECTIONS array
   * @param progress     0-1: where we are within this section (for hint fade-out)
   */
  setSection(sectionIndex: number, progress: number): void {
    // Hide scroll hint when user starts scrolling
    const hintOpacity = Math.max(0, 1 - progress * 8);
    gsap.set(this.hintEl, { opacity: hintOpacity });

    if (sectionIndex === this.currentIndex) return;
    this.currentIndex = sectionIndex;

    const meta = SECTIONS[sectionIndex];
    if (!meta) return;

    // Slide out current text, slide in new text
    const labelEl = document.getElementById("section-label")!;
    gsap.to(labelEl, {
      opacity: 0,
      y: -20,
      duration: 0.35,
      ease: "power2.in",
      onComplete: () => {
        this.numberEl.textContent = meta.number;
        this.titleEl.textContent = meta.title;
        this.subtitleEl.textContent = meta.subtitle;

        gsap.fromTo(
          labelEl,
          { opacity: 0, y: 24 },
          { opacity: 1, y: 0, duration: 0.55, ease: "power2.out" },
        );
      },
    });
  }

  /** Dim/brighten the text overlay — e.g. during scatter transitions. */
  setTextOpacity(opacity: number): void {
    gsap.set("#section-label", { opacity });
  }
}

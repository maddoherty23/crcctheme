import { Component } from '@theme/component';
import { isMobileBreakpoint } from '@theme/utilities';

/**
 * @typedef {Object} HeroSliderRefs
 * @property {HTMLElement} slidesContainer
 * @property {HTMLElement[]} slides
 * @property {HTMLElement[]} dots
 * @property {HTMLElement} prevButton
 * @property {HTMLElement} nextButton
 * @property {HTMLElement} progressBar
 */

/**
 * @typedef {Object} DragState
 * @property {number} startX
 * @property {number} currentX
 * @property {boolean} isDragging
 * @property {boolean} isInteracting
 */

const AUTO_PLAY_INTERVAL = 5000; // 5 seconds
const DRAG_THRESHOLD = 10;
const SWIPE_VELOCITY_THRESHOLD = 0.5;

/** @extends {Component<HeroSliderRefs>} */
export class HeroSliderComponent extends Component {
  requiredRefs = ['slidesContainer'];
  
  #currentIndex = 0;
  /** @type {number | null} */
  #autoPlayTimer = null;
  #isPaused = false;
  #isMobile = false;
  /** @type {DragState | null} */
  #dragState = null;
  /** @type {AbortController | null} */
  #abortController = null;

  connectedCallback() {
    super.connectedCallback();
    
    this.#isMobile = isMobileBreakpoint();
    this.#initializeSlider();
    this.#setupEventListeners();
    this.#startAutoPlay();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.#stopAutoPlay();
    this.#abortController?.abort();
  }

  /**
   * Initialize slider with current slide index
   */
  #initializeSlider() {
    const { slides } = this.refs;
    if (!slides?.length) return;

    // Set initial slide
    this.#currentIndex = Math.max(0, this.#currentIndex);
    this.#updateSlidePosition();
    this.#updateDots();
    this.#updateButtons();
    this.#updateProgressBar();
  }

  /**
   * Setup all event listeners
   */
  #setupEventListeners() {
    this.#abortController?.abort();
    this.#abortController = new AbortController();
    const opts = { signal: this.#abortController.signal };

    const { slidesContainer, prevButton, nextButton, dots } = this.refs;

    // Navigation buttons
    prevButton?.addEventListener('click', () => this.#previousSlide(), opts);
    nextButton?.addEventListener('click', () => this.#nextSlide(), opts);

    // Dot navigation
    dots?.forEach((dot, index) => {
      dot.addEventListener('click', () => this.#goToSlide(/** @type {number} */ (index)), opts);
    });

    // Touch/Swipe events
    if (slidesContainer) {
      slidesContainer.addEventListener('touchstart', (e) => this.#handleTouchStart(e), opts);
      slidesContainer.addEventListener('touchmove', (e) => this.#handleTouchMove(e), opts);
      slidesContainer.addEventListener('touchend', (e) => this.#handleTouchEnd(e), opts);
      
      // Mouse drag events for desktop
      slidesContainer.addEventListener('mousedown', (e) => this.#handleMouseDown(e), opts);
      slidesContainer.addEventListener('mousemove', (e) => this.#handleMouseMove(e), opts);
      slidesContainer.addEventListener('mouseup', (e) => this.#handleMouseUp(e), opts);
      slidesContainer.addEventListener('mouseleave', (e) => this.#handleMouseUp(e), opts);
    }

    // Pause on hover
    this.addEventListener('mouseenter', () => this.#pauseAutoPlay(), opts);
    this.addEventListener('mouseleave', () => this.#resumeAutoPlay(), opts);

    // Keyboard navigation
    this.addEventListener('keydown', (e) => this.#handleKeydown(e), opts);

    // Visibility change (pause when tab is not visible)
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.#pauseAutoPlay();
      } else {
        this.#resumeAutoPlay();
      }
    }, opts);
  }

  /**
   * Handle keyboard navigation
   */
  #handleKeydown(/** @type {KeyboardEvent} */ e) {
    const { slides } = this.refs;
    if (!slides?.length) return;

    switch (e.key) {
      case 'ArrowLeft':
        e.preventDefault();
        this.#previousSlide();
        break;
      case 'ArrowRight':
        e.preventDefault();
        this.#nextSlide();
        break;
      case 'Home':
        e.preventDefault();
        this.#goToSlide(0);
        break;
      case 'End':
        e.preventDefault();
        this.#goToSlide(slides.length - 1);
        break;
    }
  }

  /**
   * Touch event handlers
   */
  #handleTouchStart(/** @type {TouchEvent} */ e) {
    const touch = e.touches[0];
    if (!touch) return;
    this.#dragState = {
      startX: touch.clientX,
      currentX: touch.clientX,
      isDragging: false,
      isInteracting: true
    };
  }

  #handleTouchMove(/** @type {TouchEvent} */ e) {
    if (!this.#dragState?.isInteracting) return;
    
    const touch = e.touches[0];
    if (!touch) return;
    this.#dragState.currentX = touch.clientX;
    
    const deltaX = this.#dragState.currentX - this.#dragState.startX;
    const absDeltaX = Math.abs(deltaX);
    
    if (absDeltaX > DRAG_THRESHOLD) {
      this.#dragState.isDragging = true;
      this.#updateSlidePosition(deltaX);
    }
  }

  #handleTouchEnd(/** @type {TouchEvent} */ e) {
    if (!this.#dragState?.isInteracting) return;
    
    const deltaX = this.#dragState.currentX - this.#dragState.startX;
    const absDeltaX = Math.abs(deltaX);
    
    if (this.#dragState.isDragging && absDeltaX > DRAG_THRESHOLD) {
      const threshold = this.#getSlideWidth() * 0.3;
      if (absDeltaX > threshold) {
        if (deltaX > 0) {
          this.#previousSlide();
        } else {
          this.#nextSlide();
        }
      } else {
        this.#updateSlidePosition();
      }
    }
    
    this.#dragState = null;
  }

  /**
   * Mouse drag event handlers
   */
  #handleMouseDown(/** @type {MouseEvent} */ e) {
    this.#dragState = {
      startX: e.clientX,
      currentX: e.clientX,
      isDragging: false,
      isInteracting: true
    };
    e.preventDefault();
  }

  #handleMouseMove(/** @type {MouseEvent} */ e) {
    if (!this.#dragState?.isInteracting) return;
    
    this.#dragState.currentX = e.clientX;
    
    const deltaX = this.#dragState.currentX - this.#dragState.startX;
    const absDeltaX = Math.abs(deltaX);
    
    if (absDeltaX > DRAG_THRESHOLD) {
      this.#dragState.isDragging = true;
      this.#updateSlidePosition(deltaX);
    }
  }

  #handleMouseUp(/** @type {MouseEvent} */ e) {
    if (!this.#dragState?.isInteracting) return;
    
    const deltaX = this.#dragState.currentX - this.#dragState.startX;
    const absDeltaX = Math.abs(deltaX);
    
    if (this.#dragState.isDragging && absDeltaX > DRAG_THRESHOLD) {
      const threshold = this.#getSlideWidth() * 0.3;
      if (absDeltaX > threshold) {
        if (deltaX > 0) {
          this.#previousSlide();
        } else {
          this.#nextSlide();
        }
      } else {
        this.#updateSlidePosition();
      }
    }
    
    this.#dragState = null;
  }

  /**
   * Get slide width for calculations
   */
  #getSlideWidth() {
    const { slidesContainer } = this.refs;
    if (!slidesContainer) return 0;
    return slidesContainer.offsetWidth;
  }

  /**
   * Navigation methods
   */
  #nextSlide() {
    const { slides } = this.refs;
    if (!slides?.length) return;
    
    this.#currentIndex = (this.#currentIndex + 1) % slides.length;
    this.#updateSlidePosition();
    this.#updateDots();
    this.#updateButtons();
    this.#updateProgressBar();
    this.#resetAutoPlay();
  }

  #previousSlide() {
    const { slides } = this.refs;
    if (!slides?.length) return;
    
    this.#currentIndex = (this.#currentIndex - 1 + slides.length) % slides.length;
    this.#updateSlidePosition();
    this.#updateDots();
    this.#updateButtons();
    this.#updateProgressBar();
    this.#resetAutoPlay();
  }

  #goToSlide(/** @type {number} */ index) {
    const { slides } = this.refs;
    if (!slides?.length || index < 0 || index >= slides.length) return;
    
    this.#currentIndex = index;
    this.#updateSlidePosition();
    this.#updateDots();
    this.#updateButtons();
    this.#updateProgressBar();
    this.#resetAutoPlay();
  }

  /**
   * Update slide position with optional drag offset
   */
  #updateSlidePosition(dragOffset = 0) {
    const { slidesContainer, slides } = this.refs;
    if (!slidesContainer || !slides?.length) return;

    const slideWidth = this.#getSlideWidth();
    const offset = -this.#currentIndex * slideWidth + dragOffset;
    
    slidesContainer.style.transform = `translateX(${offset}px)`;
    
    // Update slide states for accessibility
    slides.forEach((slide, index) => {
      const isActive = index === this.#currentIndex;
      slide.setAttribute('aria-hidden', String(!isActive));
      slide.toggleAttribute('inert', !isActive);
    });
  }

  /**
   * Update dot indicators
   */
  #updateDots() {
    const { dots } = this.refs;
    if (!dots?.length) return;

    dots.forEach((dot, index) => {
      const isActive = index === this.#currentIndex;
      dot.setAttribute('aria-current', String(isActive));
      dot.classList.toggle('hero-slider__dot--active', isActive);
    });
  }

  /**
   * Update navigation button states
   */
  #updateButtons() {
    const { prevButton, nextButton } = this.refs;
    const { slides } = this.refs;
    if (!slides?.length) return;

    // Enable/disable buttons based on current position
    if (prevButton && prevButton instanceof HTMLButtonElement) {
      prevButton.disabled = this.#currentIndex === 0;
    }
    if (nextButton && nextButton instanceof HTMLButtonElement) {
      nextButton.disabled = this.#currentIndex === slides.length - 1;
    }
  }

  /**
   * Update progress bar
   */
  #updateProgressBar() {
    const { progressBar } = this.refs;
    const { slides } = this.refs;
    if (!progressBar || !slides?.length) return;

    const progress = ((this.#currentIndex + 1) / slides.length) * 100;
    progressBar.style.width = `${progress}%`;
  }

  /**
   * Auto-play functionality
   */
  #startAutoPlay() {
    if (this.dataset.autoPlay === 'false') return;
    
    this.#stopAutoPlay();
    this.#autoPlayTimer = setInterval(() => {
      if (!this.#isPaused) {
        this.#nextSlide();
      }
    }, AUTO_PLAY_INTERVAL);
  }

  #stopAutoPlay() {
    if (this.#autoPlayTimer) {
      clearInterval(this.#autoPlayTimer);
      this.#autoPlayTimer = null;
    }
  }

  #pauseAutoPlay() {
    this.#isPaused = true;
  }

  #resumeAutoPlay() {
    this.#isPaused = false;
  }

  #resetAutoPlay() {
    this.#stopAutoPlay();
    this.#startAutoPlay();
  }

  /**
   * Public API methods
   */
  next() {
    this.#nextSlide();
  }

  previous() {
    this.#previousSlide();
  }

  goTo(/** @type {number} */ index) {
    this.#goToSlide(index);
  }

  pause() {
    this.#pauseAutoPlay();
  }

  play() {
    this.#resumeAutoPlay();
  }
}

if (!customElements.get('hero-slider-component')) {
  customElements.define('hero-slider-component', HeroSliderComponent);
}

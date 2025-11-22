// upgrade-guide.js
// EDHREC Upgrade Guide Extraction System
// Purpose: Extract and parse EDHREC upgrade guide articles into structured content blocks

class EDHRECUpgradeGuideExtractor {
    constructor() {
        // Proxy configuration for CORS bypass - same as original app
        this.proxies = [
            'https://cors-anywhere.herokuapp.com/',
            'https://corsproxy.io/?', 
            'https://api.codetabs.com/v1/proxy?quest=',
            ''  // Direct fetch as last resort
        ];
        
        // Content classification thresholds
        this.MIN_PARAGRAPH_LENGTH = 20;  // Minimum characters to consider as paragraph
        this.MAX_CARDNAME_LENGTH = 100;  // Maximum characters for card name detection
    }

    /**
     * MAIN ENTRY POINT: Extract upgrade guide from URL
     * Flow: Fetch HTML → Parse DOM → Classify Content → Return Structured Data
     * @param {string} url - EDHREC upgrade guide URL
     * @returns {Object} Structured guide data with content blocks
     */
    async extractUpgradeGuide(url) {
        console.log('🔍 EDHREC Upgrade Guide Extraction Started:', url);
        
        try {
            // STEP 1: Fetch HTML content using proxy rotation
            const htmlContent = await this.fetchWithProxies(url);
            if (!htmlContent) throw new Error('Failed to fetch HTML content');

            // STEP 2: Parse HTML and extract structured content
            const guideData = this.parseUpgradeGuideContent(htmlContent);
            
            // STEP 3: Validate we have meaningful content
            if (!guideData.contentBlocks || guideData.contentBlocks.length === 0) {
                throw new Error('No meaningful content blocks found');
            }

            console.log('✅ Upgrade guide extracted successfully:', {
                title: guideData.title,
                blocks: guideData.contentBlocks.length,
                types: this.countContentTypes(guideData.contentBlocks)
            });

            return guideData;
            
        } catch (error) {
            console.error('❌ Upgrade guide extraction failed:', error);
            // Fallback to sample data for demonstration
            return this.getSampleUpgradeGuide();
        }
    }

    /**
     * PROXY FETCH SYSTEM: Try multiple CORS proxies sequentially
     * Why needed: EDHREC may block direct browser requests due to CORS policies
     * @param {string} url - Target URL to fetch
     * @returns {string} HTML content
     */
    async fetchWithProxies(url) {
        for (const proxy of this.proxies) {
            try {
                const proxyUrl = proxy + url;
                console.log(`🔄 Attempting fetch with proxy: ${proxy || 'DIRECT'}`);
                
                const response = await fetch(proxyUrl);
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                
                const htmlContent = await response.text();
                console.log('✅ Fetch successful with proxy:', proxy || 'DIRECT');
                return htmlContent;
                
            } catch (proxyError) {
                console.log(`❌ Proxy failed: ${proxyError.message}`);
                // Wait before trying next proxy (rate limiting)
                if (proxy !== this.proxies[this.proxies.length - 1]) {
                    await new Promise(resolve => setTimeout(resolve, 300));
                }
            }
        }
        throw new Error('All proxy attempts failed');
    }

    /**
     * CONTENT PARSING ENGINE: Convert HTML into structured content blocks
     * Flow: Parse DOM → Traverse Elements → Classify → Extract → Structure
     * @param {string} htmlContent - Raw HTML from EDHREC
     * @returns {Object} Structured guide data
     */
    parseUpgradeGuideContent(htmlContent) {
        // Create DOM parser to convert HTML string into traversable DOM tree
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlContent, 'text/html');
        
        // Initialize guide data structure
        const guideData = {
            title: '',
            author: '',
            date: '',
            contentBlocks: [] // Array of mixed content types in original order
        };

        // STEP 1: Extract metadata (title, author, date)
        this.extractMetadata(doc, guideData);

        // STEP 2: Find main content area in the DOM
        const contentElement = this.findMainContentElement(doc);
        if (!contentElement) {
            throw new Error('Could not find main content area');
        }

        // STEP 3: Extract all content blocks in order
        this.extractContentBlocks(contentElement, guideData);

        return guideData;
    }

    /**
     * METADATA EXTRACTION: Get title, author, and date from page
     * Why: Provides context and attribution for the guide
     * @param {Document} doc - Parsed DOM document
     * @param {Object} guideData - Guide data to populate
     */
    extractMetadata(doc, guideData) {
        // Title extraction - try multiple selectors for robustness
        const titleSelectors = ['h1', '.article-title', '.title', 'title'];
        for (const selector of titleSelectors) {
            const element = doc.querySelector(selector);
            if (element && element.textContent.trim()) {
                guideData.title = element.textContent.trim();
                break;
            }
        }

        // Author extraction - common EDHREC patterns
        const authorSelectors = ['.author', '.article-meta', '[rel="author"]', '.byline'];
        for (const selector of authorSelectors) {
            const element = doc.querySelector(selector);
            if (element && element.textContent.trim()) {
                guideData.author = element.textContent.trim();
                break;
            }
        }

        // Date extraction
        const dateSelectors = ['.date', '.article-date', '.published', 'time'];
        for (const selector of dateSelectors) {
            const element = doc.querySelector(selector);
            if (element && element.textContent.trim()) {
                guideData.date = element.textContent.trim();
                break;
            }
        }

        console.log('📄 Metadata extracted:', {
            title: guideData.title,
            author: guideData.author,
            date: guideData.date
        });
    }

    /**
     * MAIN CONTENT LOCATOR: Find the primary content container
     * Why: EDHREC pages have navigation, ads, sidebars - we want only the article
     * @param {Document} doc - Parsed DOM document
     * @returns {Element} Main content element
     */
    findMainContentElement(doc) {
        // Priority order of content container selectors (most specific first)
        const contentSelectors = [
            '.article-content',
            '.content',
            'main',
            '[role="main"]',
            '.post-content',
            '.entry-content'
        ];

        for (const selector of contentSelectors) {
            const element = doc.querySelector(selector);
            if (element) {
                console.log('🎯 Found content container using selector:', selector);
                return element;
            }
        }

        // Fallback: use body if no specific container found
        console.log('⚠️ Using body as content container (no specific container found)');
        return doc.body;
    }

    /**
     * CONTENT BLOCK EXTRACTION: Convert DOM elements into classified content blocks
     * This is the CORE LOGIC that implements your three content type classification
     * @param {Element} contentElement - Main content container
     * @param {Object} guideData - Guide data to populate with blocks
     */
    extractContentBlocks(contentElement, guideData) {
        // Get all direct child elements of the content container
        const elements = Array.from(contentElement.children);
        console.log(`🔍 Processing ${elements.length} direct child elements`);

        for (const element of elements) {
            // STEP 1: Filter out unwanted elements (ads, navigation, etc.)
            if (this.shouldSkipElement(element)) {
                console.log('⏭️ Skipping element:', element.tagName, element.className);
                continue;
            }

            // STEP 2: Classify element and extract as appropriate content block
            const contentBlock = this.classifyAndExtractElement(element);
            if (contentBlock) {
                guideData.contentBlocks.push(contentBlock);
                console.log('✅ Added content block:', contentBlock.type, contentBlock.text?.substring(0, 50) || '');
            }

            // STEP 3: Recursively process containers that might have nested content
            if (this.isContentContainer(element) && !this.isCardElement(element)) {
                console.log('🔄 Recursively processing container:', element.tagName);
                this.extractContentBlocks(element, guideData);
            }
        }
    }

    /**
     * ELEMENT CLASSIFICATION: Determine content type and extract accordingly
     * Implements your three content type specification:
     * 1. Paragraphs of text - extract as-is, no card processing
     * 2. Cardlists - extract as plain text lists  
     * 3. Individual cards - identify for later conversion to card frames
     * @param {Element} element - DOM element to classify
     * @returns {Object|null} Content block object or null if not relevant
     */
    classifyAndExtractElement(element) {
        // CONTENT TYPE 1: HEADERS (H1-H6)
        if (element.tagName.match(/^H[1-6]$/)) {
            return {
                type: 'header',
                level: parseInt(element.tagName.substring(1)),
                text: this.cleanTextContent(element)
            };
        }

        // CONTENT TYPE 2: PARAGRAPHS (extract as-is, no card processing)
        if (element.tagName === 'P' || this.isParagraphLike(element)) {
            const text = this.cleanTextContent(element);
            if (text.length >= this.MIN_PARAGRAPH_LENGTH) {
                return {
                    type: 'paragraph',
                    text: text
                };
            }
        }

        // CONTENT TYPE 3: CARD LISTS (ordered/unordered lists)
        if (element.tagName === 'UL' || element.tagName === 'OL') {
            const listItems = this.extractListItems(element);
            if (listItems.length > 0) {
                return {
                    type: 'cardlist',
                    isOrdered: element.tagName === 'OL',
                    items: listItems
                };
            }
        }

        // CONTENT TYPE 4: INDIVIDUAL CARDS (identify for card frame conversion)
        if (this.isCardElement(element)) {
            const cardName = this.extractCardNameFromElement(element);
            if (cardName) {
                return {
                    type: 'individualCard',
                    cardName: cardName,
                    // Store original HTML for debugging/reference
                    elementHtml: element.outerHTML.substring(0, 200) + '...'
                };
            }
        }

        return null;
    }

    /**
     * PARAGRAPH DETECTION: Identify elements that should be treated as paragraphs
     * Why: Some content may be in divs or other containers that behave like paragraphs
     * @param {Element} element - DOM element to check
     * @returns {boolean} True if element should be treated as paragraph
     */
    isParagraphLike(element) {
        // Block elements that can contain paragraph-like content
        const blockElements = ['DIV', 'SECTION', 'ARTICLE', 'MAIN'];
        if (!blockElements.includes(element.tagName)) return false;
        
        // Check if it contains substantial text content
        const text = this.cleanTextContent(element);
        const hasSubstantialText = text.length >= this.MIN_PARAGRAPH_LENGTH;
        const isCardContainer = this.isCardElement(element);
        
        return hasSubstantialText && !isCardContainer;
    }

    /**
     * CARD ELEMENT DETECTION: Identify elements that represent individual cards
     * Why: These will be converted to full card frames with complete data
     * @param {Element} element - DOM element to check
     * @returns {boolean} True if element represents a card
     */
    isCardElement(element) {
        // Method 1: Check for common EDHREC card class patterns
        const cardClasses = ['card', 'card-image', 'card-preview', 'card-frame'];
        const hasCardClass = cardClasses.some(cls => 
            element.classList.contains(cls) || 
            element.querySelector(`.${cls}`)
        );

        // Method 2: Check for data attributes commonly used for cards
        const hasCardData = element.hasAttribute('data-card-name') || 
                          element.querySelector('[data-card-name]');

        // Method 3: Check for images with card names in alt text
        const cardImages = element.querySelectorAll('img[alt]');
        const hasCardImage = Array.from(cardImages).some(img => 
            this.looksLikeCardName(img.alt)
        );

        return hasCardClass || hasCardData || hasCardImage;
    }

    /**
     * CARD NAME EXTRACTION: Extract card name from card element
     * Why: We need the exact card name to fetch full data from Scryfall
     * @param {Element} element - Card element to extract from
     * @returns {string|null} Card name or null if not found
     */
    extractCardNameFromElement(element) {
        // Priority 1: data-card-name attribute (most reliable)
        const dataCardName = element.getAttribute('data-card-name') || 
                           element.querySelector('[data-card-name]')?.getAttribute('data-card-name');
        if (dataCardName) return dataCardName.trim();

        // Priority 2: Image alt text (common in EDHREC)
        const images = element.querySelectorAll('img[alt]');
        for (const img of images) {
            if (this.looksLikeCardName(img.alt)) {
                return img.alt.trim();
            }
        }

        // Priority 3: Text content analysis (fallback)
        const text = element.textContent.trim();
        if (this.looksLikeCardName(text)) {
            return text;
        }

        return null;
    }

    /**
     * CARD NAME VALIDATION: Heuristic to check if text looks like a card name
     * Why: Avoid false positives from random text
     * @param {string} text - Text to validate
     * @returns {boolean} True if text appears to be a card name
     */
    looksLikeCardName(text) {
        if (!text || text.length < 2 || text.length > this.MAX_CARDNAME_LENGTH) {
            return false;
        }

        // Card names don't typically start with numbers or lowercase letters
        if (text.match(/^\d/)) return false;
        if (text.match(/^[a-z]/)) return false;

        // Exclude common non-card text patterns
        const excludePatterns = [
            /\.\.\./, // Truncated text
            /\b(deck|card|magic|the|a|an|and|or|but|in|on|at|to|for|of)\b/i, // Common words
            /^http/, // URLs
            /^\d+$/ // Just numbers
        ];

        return !excludePatterns.some(pattern => pattern.test(text));
    }

    /**
     * LIST ITEM EXTRACTION: Get plain text from list elements
     * Why: Cardlists should be extracted as-is without special processing
     * @param {Element} listElement - UL or OL element
     * @returns {string[]} Array of list item texts
     */
    extractListItems(listElement) {
        const items = [];
        const listItems = listElements.querySelectorAll('li');
        
        listItems.forEach(li => {
            const text = this.cleanTextContent(li);
            if (text.trim().length > 0) {
                items.push(text.trim());
            }
        });
        
        return items;
    }

    /**
     * ELEMENT FILTERING: Determine if element should be skipped
     * Why: Remove ads, navigation, and other non-content elements
     * @param {Element} element - DOM element to check
     * @returns {boolean} True if element should be skipped
     */
    shouldSkipElement(element) {
        // Skip invisible elements
        if (element.offsetParent === null) return true;

        // Skip script and style elements
        if (element.tagName === 'SCRIPT' || element.tagName === 'STYLE') return true;

        // Skip elements with unwanted classes
        const skipClasses = ['advertisement', 'ad', 'navigation', 'nav', 'sidebar', 'footer', 'header'];
        const skipSelectors = ['.ad', '.nav', '.sidebar', '.footer', '.header', '.menu', '.ads'];
        
        if (skipSelectors.some(selector => element.matches(selector))) return true;
        if (skipClasses.some(cls => element.classList.contains(cls))) return true;

        // Skip elements with very little text content
        const text = this.cleanTextContent(element);
        if (text.length < 10) return true;

        return false;
    }

    /**
     * CONTENT CONTAINER DETECTION: Identify elements that may contain nested content
     * Why: Some content blocks may be nested inside containers
     * @param {Element} element - DOM element to check
     * @returns {boolean} True if element may contain nested content blocks
     */
    isContentContainer(element) {
        const containerTags = ['DIV', 'SECTION', 'ARTICLE', 'MAIN', 'ASIDE'];
        return containerTags.includes(element.tagName) && 
               !this.shouldSkipElement(element);
    }

    /**
     * TEXT CLEANING: Remove unwanted characters and normalize whitespace
     * Why: Clean text for display and analysis
     * @param {Element} element - DOM element to clean text from
     * @returns {string} Cleaned text content
     */
    cleanTextContent(element) {
        // Clone to avoid modifying original element
        const clone = element.cloneNode(true);
        
        // Remove script and style elements from clone
        clone.querySelectorAll('script, style').forEach(el => el.remove());
        
        // Get text content and clean it
        let text = clone.textContent
            .replace(/\s+/g, ' ')  // Normalize whitespace
            .replace(/\n+/g, ' ')  // Remove line breaks
            .trim();
            
        return text;
    }

    /**
     * CONTENT TYPE ANALYSIS: Count different content types for logging
     * Why: Helpful for debugging and understanding content distribution
     * @param {Array} contentBlocks - Array of content blocks
     * @returns {Object} Counts by content type
     */
    countContentTypes(contentBlocks) {
        const counts = {
            header: 0,
            paragraph: 0,
            cardlist: 0,
            individualCard: 0
        };
        
        contentBlocks.forEach(block => {
            if (counts.hasOwnProperty(block.type)) {
                counts[block.type]++;
            }
        });
        
        return counts;
    }

    /**
     * SAMPLE DATA: Fallback guide for testing/demonstration
     * Why: Provides working data when extraction fails or for development
     * @returns {Object} Sample upgrade guide data
     */
    getSampleUpgradeGuide() {
        return {
            title: "Veloci-Ramp-Tor Upgrade Guide - Sample Data",
            author: "EDHREC Team",
            date: "2024",
            contentBlocks: [
                {
                    type: 'header',
                    level: 1,
                    text: 'Veloci-Ramp-Tor Upgrade Guide'
                },
                {
                    type: 'paragraph',
                    text: 'Welcome to the upgrade guide for Veloci-Ramp-Tor! This aggressive dinosaur commander wants to smash face quickly and efficiently. We\'ll be upgrading the mana base, adding powerful threats, and improving the overall consistency.'
                },
                {
                    type: 'header', 
                    level: 2,
                    text: 'Original Decklist'
                },
                {
                    type: 'cardlist',
                    isOrdered: false,
                    items: [
                        '1 Command Tower',
                        '1 Forest', 
                        '1 Mountain',
                        '1 Sol Ring',
                        '1 Llanowar Elves',
                        '1 Lizard Blades',
                        '1 Swiftfoot Boots'
                    ]
                },
                {
                    type: 'header',
                    level: 2, 
                    text: 'Mana Base Upgrades'
                },
                {
                    type: 'paragraph',
                    text: 'First, let\'s improve the mana consistency. We need lands that come in untapped and provide multiple colors efficiently.'
                },
                {
                    type: 'individualCard',
                    cardName: 'Breeding Pool'
                },
                {
                    type: 'individualCard',
                    cardName: 'Stomping Ground'
                },
                {
                    type: 'header',
                    level: 2,
                    text: 'Powerful Additions' 
                },
                {
                    type: 'paragraph',
                    text: 'These cards will significantly increase your win percentage by providing explosive turns and powerful effects.'
                },
                {
                    type: 'individualCard',
                    cardName: 'Ghalta, Primal Hunger'
                },
                {
                    type: 'individualCard', 
                    cardName: 'Terror of the Peaks'
                },
                {
                    type: 'header',
                    level: 2,
                    text: 'Upgraded Decklist'
                },
                {
                    type: 'cardlist', 
                    isOrdered: false,
                    items: [
                        '1 Command Tower',
                        '1 Breeding Pool',
                        '1 Stomping Ground', 
                        '1 Sol Ring',
                        '1 Ghalta, Primal Hunger',
                        '1 Terror of the Peaks',
                        '1 Nature\'s Lore'
                    ]
                }
            ]
        };
    }
}

// Make available globally for use in other modules
window.EDHRECUpgradeGuideExtractor = EDHRECUpgradeGuideExtractor;

// Export main function for easy access
async function extractEDHRECUpgradeGuide(url) {
    const extractor = new EDHRECUpgradeGuideExtractor();
    return await extractor.extractUpgradeGuide(url);
}

window.extractEDHRECUpgradeGuide = extractEDHRECUpgradeGuide;

console.log('✅ upgrade-guide.js loaded successfully');

// ADD TO upgrade-guide.js (after the extractor class)

/**
 * UPGRADE GUIDE DISPLAY ENGINE
 * Purpose: Render structured upgrade guide content using the original app's aesthetic
 * Flow: Process content blocks → Create DOM elements → Apply styling → Display
 */
class UpgradeGuideDisplayEngine {
    constructor() {
        this.scryfall = new ScryfallAPI(); // Reuse existing Scryfall integration
        this.cardCache = new Map(); // Cache card data to avoid duplicate API calls
        this.symbolsReady = false; // Track symbol database readiness
    }

    /**
     * MAIN DISPLAY METHOD: Render complete upgrade guide
     * Flow: Header → Process Blocks → Apply Styling
     * @param {Object} guideData - Structured guide data from extractor
     * @param {Element} container - DOM element to render into
     */
    async displayUpgradeGuide(guideData, container) {
        if (!container) {
            console.error('❌ No container provided for upgrade guide display');
            return;
        }

        console.log('🎨 Rendering upgrade guide:', {
            title: guideData.title,
            blocks: guideData.contentBlocks.length
        });

        // Clear container and show loading state
        container.innerHTML = '<div class="loading-spinner">Rendering upgrade guide...</div>';

        try {
            // STEP 1: Create and append guide header
            const header = this.createGuideHeader(guideData);
            container.innerHTML = ''; // Clear loading message
            container.appendChild(header);

            // STEP 2: Ensure symbol support is ready (for card frames)
            await this.ensureSymbolSupport();

            // STEP 3: Process all content blocks in original order
            for (const block of guideData.contentBlocks) {
                const blockElement = await this.createContentBlock(block);
                if (blockElement) {
                    container.appendChild(blockElement);
                }
            }

            console.log('✅ Upgrade guide rendered successfully');

        } catch (error) {
            console.error('❌ Upgrade guide rendering failed:', error);
            container.innerHTML = '<div class="error-message">Failed to render upgrade guide</div>';
        }
    }

    /**
     * GUIDE HEADER CREATION: Create title, author, and date display
     * Why: Provides context and professional presentation
     * @param {Object} guideData - Guide data with metadata
     * @returns {Element} Header DOM element
     */
    createGuideHeader(guideData) {
        const header = document.createElement('div');
        header.className = 'upgrade-guide-header';
        
        // Title (always present)
        const titleElement = document.createElement('h1');
        titleElement.className = 'guide-title';
        titleElement.textContent = guideData.title;
        header.appendChild(titleElement);

        // Metadata container for author and date
        if (guideData.author || guideData.date) {
            const metaContainer = document.createElement('div');
            metaContainer.className = 'guide-meta';
            
            if (guideData.author) {
                const authorElement = document.createElement('div');
                authorElement.className = 'guide-author';
                authorElement.textContent = `By ${guideData.author}`;
                metaContainer.appendChild(authorElement);
            }
            
            if (guideData.date) {
                const dateElement = document.createElement('div');
                dateElement.className = 'guide-date';
                dateElement.textContent = guideData.date;
                metaContainer.appendChild(dateElement);
            }
            
            header.appendChild(metaContainer);
        }

        return header;
    }

    /**
     * CONTENT BLOCK ROUTER: Create appropriate DOM element for each content type
     * Implements the visual representation of your three content types
     * @param {Object} block - Content block from extractor
     * @returns {Element} DOM element for the block
     */
    async createContentBlock(block) {
        console.log('🔄 Rendering content block:', block.type, block.text?.substring(0, 30) || block.cardName);

        switch (block.type) {
            case 'header':
                return this.createHeaderBlock(block);
                
            case 'paragraph':
                return this.createParagraphBlock(block);
                
            case 'cardlist':
                return this.createCardListBlock(block);
                
            case 'individualCard':
                return await this.createIndividualCardBlock(block);
                
            default:
                console.warn('⚠️ Unknown content block type:', block.type);
                return null;
        }
    }

    /**
     * HEADER BLOCK: Create hierarchical header element
     * Why: Maintains document structure and readability
     * @param {Object} block - Header content block
     * @returns {Element} H1-H6 element
     */
    createHeaderBlock(block) {
        const header = document.createElement(`h${block.level}`);
        header.className = `guide-header level-${block.level}`;
        header.textContent = block.text;
        return header;
    }

    /**
     * PARAGRAPH BLOCK: Create text paragraph element
     * Why: Displays explanatory text as-is without processing
     * @param {Object} block - Paragraph content block
     * @returns {Element} Paragraph DIV element
     */
    createParagraphBlock(block) {
        const paragraph = document.createElement('div');
        paragraph.className = 'guide-paragraph';
        
        // Preserve line breaks from original text
        const textWithBreaks = block.text.replace(/\n/g, '<br>');
        paragraph.innerHTML = textWithBreaks;
        
        return paragraph;
    }

    /**
     * CARD LIST BLOCK: Create formatted list element
     * Why: Displays decklists and card lists as plain text
     * @param {Object} block - Cardlist content block
     * @returns {Element} List container element
     */
    createCardListBlock(block) {
        const container = document.createElement('div');
        container.className = 'guide-cardlist';
        
        // Create appropriate list type (ordered/unordered)
        const list = document.createElement(block.isOrdered ? 'ol' : 'ul');
        list.className = block.isOrdered ? 'ordered-list' : 'unordered-list';
        
        // Add each list item
        block.items.forEach(item => {
            const listItem = document.createElement('li');
            listItem.textContent = item;
            list.appendChild(listItem);
        });
        
        container.appendChild(list);
        return container;
    }

    /**
     * INDIVIDUAL CARD BLOCK: Create full card frame with complete data
     * WHY: This is where we convert identified cards to your original app's card frame format
     * @param {Object} block - Individual card content block
     * @returns {Element} Card frame element
     */
    async createIndividualCardBlock(block) {
        try {
            console.log(`🃏 Creating card frame for: ${block.cardName}`);
            
            // STEP 1: Get complete card data from Scryfall
            const cardData = await this.getCardData(block.cardName);
            if (!cardData) {
                return this.createCardNotFoundBlock(block.cardName);
            }

            // STEP 2: Create card frame using original app's structure and styling
            const cardFrame = await this.createCardFrame(cardData);
            return cardFrame;
            
        } catch (error) {
            console.error(`❌ Error creating card block for ${block.cardName}:`, error);
            return this.createCardErrorBlock(block.cardName, error.message);
        }
    }

    /**
     * CARD DATA FETCHING: Get complete card information from Scryfall
     * Why: Individual cards need full data for the card frame display
     * @param {string} cardName - Name of card to fetch
     * @returns {Object|null} Complete card data or null if not found
     */
    async getCardData(cardName) {
        // Check cache first to avoid duplicate API calls
        if (this.cardCache.has(cardName)) {
            console.log(`📦 Using cached data for: ${cardName}`);
            return this.cardCache.get(cardName);
        }

        try {
            console.log(`🌐 Fetching Scryfall data for: ${cardName}`);
            
            // Get basic card data from Scryfall
            const scryfallData = await this.scryfall.getCardByName(cardName);
            if (!scryfallData) {
                console.warn(`❌ Card not found in Scryfall: ${cardName}`);
                return null;
            }

            // Get dual currency pricing (USD + NZD stacked)
            const price = await this.scryfall.getPriceDisplay(scryfallData.prices, true);

            // Extract set information
            const setCode = scryfallData.set || '';
            const setName = scryfallData.set_name || '';
            const releaseYear = scryfallData.released_at ? 
                new Date(scryfallData.released_at).getFullYear().toString() : '';

            // Get set symbol from symbol database (if available)
            let setSymbol = '';
            if (window.symbolDatabase && window.symbolDatabase.initialized) {
                try {
                    const setData = await window.symbolDatabase.getSetDataWithDownload(setCode);
                    setSymbol = setData.symbol || '';
                } catch (symbolError) {
                    console.warn(`⚠️ Could not get symbol for ${setCode}:`, symbolError);
                }
            }

            // Structure card data to match original app's format
            const cardData = {
                name: scryfallData.name,
                mana_cost: scryfallData.mana_cost,
                type_line: scryfallData.type_line,
                oracle_text: scryfallData.oracle_text,
                flavor_text: scryfallData.flavor_text,
                power: scryfallData.power,
                toughness: scryfallData.toughness,
                loyalty: scryfallData.loyalty,
                defense: scryfallData.defense,
                price: price,
                set_name: setName,
                set_code: setCode,
                set_symbol: setSymbol,
                release_year: releaseYear
            };

            // Cache for future use
            this.cardCache.set(cardName, cardData);
            console.log(`✅ Card data retrieved: ${cardName}`);

            return cardData;

        } catch (error) {
            console.error(`❌ Error fetching card data for ${cardName}:`, error);
            return null;
        }
    }

    /**
     * CARD FRAME CREATION: Build card frame using original app's structure
     * Why: Maintains consistent aesthetic with your existing card displays
     * @param {Object} cardData - Complete card data from Scryfall
     * @returns {Element} Card frame DOM element
     */
    async createCardFrame(cardData) {
        const frame = document.createElement('div');
        frame.className = 'card-frame font-size-md'; // Use original app's styling

        // Generate power/toughness/loyalty/defense display
        const ptHTML = this.generatePowerToughness(cardData);
        
        // Generate set data display (left side)
        const setDataHTML = this.generateSetData(cardData);
        
        // Generate set symbol for stats area
        const setSymbolHTML = cardData.set_symbol ? 
            `<img src="${cardData.set_symbol}" alt="${cardData.set_name}" class="set-symbol-stats">` : 
            '';
        
        const setCodeHTML = cardData.set_code ? 
            `<span class="set-code-stats">${this.escapeHTML(cardData.set_code.toUpperCase())}</span>` : 
            '';

        // Build card frame HTML using original app's structure
        frame.innerHTML = `
            <div class="card-header">
                <h3 class="card-name">${this.escapeHTML(cardData.name)}</h3>
                ${cardData.mana_cost ? `<span class="card-mana-cost">${this.formatManaCost(cardData.mana_cost)}</span>` : ''}
            </div>
            <div class="card-type-line">${this.escapeHTML(cardData.type_line)}</div>
            <div class="card-content">
                ${cardData.oracle_text ? `<div class="card-text">${this.formatCardText(cardData.oracle_text)}</div>` : ''}
                ${cardData.flavor_text ? `<div class="card-flavor-text">${this.escapeHTML(cardData.flavor_text)}</div>` : ''}
                ${setDataHTML ? `<div class="card-set-container">${setDataHTML}</div>` : ''}
                ${ptHTML ? `<div class="card-pt-container">${ptHTML}</div>` : ''}
            </div>
            <div class="card-stats">
                ${setSymbolHTML}
                ${setCodeHTML}
                <span class="stats-gap"></span>
                <span class="card-price">${cardData.price}</span>
            </div>
        `;

        return frame;
    }

    /**
     * POWER/TOUGHNESS GENERATOR: Create P/T display for creatures
     * Why: Part of complete card data display
     * @param {Object} cardData - Card data object
     * @returns {string} P/T HTML or empty string
     */
    generatePowerToughness(cardData) {
        if (cardData.power !== null && cardData.toughness !== null) {
            return `${cardData.power}/${cardData.toughness}`;
        }
        if (cardData.loyalty !== null) {
            return cardData.loyalty;
        }
        if (cardData.defense !== null) {
            return cardData.defense;
        }
        return '';
    }

    /**
     * SET DATA GENERATOR: Create set information display
     * Why: Shows release year and set name (left side of card)
     * @param {Object} cardData - Card data object
     * @returns {string} Set data HTML or empty string
     */
    generateSetData(cardData) {
        if (!cardData.set_name && !cardData.release_year) {
            return '';
        }
        
        const yearHTML = cardData.release_year ? 
            `<span class="release-year">${this.escapeHTML(cardData.release_year)}</span>` : 
            '';
        
        const setNameHTML = cardData.set_name ? 
            `<span class="set-name">${this.escapeHTML(cardData.set_name)}</span>` : 
            '';
        
        if (!setNameHTML && !yearHTML) {
            return '';
        }
        
        return `
            <div class="set-data">
                ${yearHTML}
                ${setNameHTML}           
            </div>
        `;
    }

    /**
     * CARD NOT FOUND FALLBACK: Create placeholder for missing cards
     * Why: Graceful degradation when Scryfall doesn't have the card
     * @param {string} cardName - Name of missing card
     * @returns {Element} Placeholder card frame
     */
    createCardNotFoundBlock(cardName) {
        const container = document.createElement('div');
        container.className = 'card-not-found';
        container.innerHTML = `
            <div class="card-frame">
                <div class="card-header">
                    <h3 class="card-name">${this.escapeHTML(cardName)}</h3>
                </div>
                <div class="card-content">
                    <div class="card-text">Card not found in Scryfall database</div>
                </div>
                <div class="card-stats">
                    <span class="card-price">Price N/A</span>
                </div>
            </div>
        `;
        return container;
    }

    /**
     * CARD ERROR FALLBACK: Create placeholder for card loading errors
     * Why: Handle API failures and network issues gracefully
     * @param {string} cardName - Name of card that failed
     * @param {string} errorMessage - Error details
     * @returns {Element} Error card frame
     */
    createCardErrorBlock(cardName, errorMessage) {
        const container = document.createElement('div');
        container.className = 'card-error';
        container.innerHTML = `
            <div class="card-frame">
                <div class="card-header">
                    <h3 class="card-name">${this.escapeHTML(cardName)}</h3>
                </div>
                <div class="card-content">
                    <div class="card-text">Error loading card data: ${this.escapeHTML(errorMessage)}</div>
                </div>
                <div class="card-stats">
                    <span class="card-price">Price N/A</span>
                </div>
            </div>
        `;
        return container;
    }

    /**
     * SYMBOL SUPPORT CHECK: Ensure symbol database is ready
     * Why: Card frames need set symbols for complete display
     */
    async ensureSymbolSupport() {
        if (this.symbolsReady) return true;
        
        // Wait for symbol database to be available
        if (window.symbolDatabase && !window.symbolDatabase.initialized) {
            console.log('⏳ Waiting for symbol database initialization...');
            await new Promise((resolve) => {
                const checkInterval = setInterval(() => {
                    if (window.symbolDatabase.initialized) {
                        clearInterval(checkInterval);
                        this.symbolsReady = true;
                        resolve(true);
                    }
                }, 100);
                
                // Timeout after 5 seconds
                setTimeout(() => {
                    clearInterval(checkInterval);
                    console.log('⚠️ Symbol database timeout, proceeding without symbols');
                    this.symbolsReady = false;
                    resolve(false);
                }, 5000);
            });
        }
        
        this.symbolsReady = true;
        return true;
    }

    /**
     * MANA COST FORMATTING: Convert mana symbols to display format
     * Why: Mana costs use {W}{U}{B} format that needs cleaning
     * @param {string} manaCost - Mana cost string from Scryfall
     * @returns {string} Formatted mana cost
     */
    formatManaCost(manaCost) {
        return manaCost.replace(/\{([^}]+)\}/g, '$1');
    }

    /**
     * CARD TEXT FORMATTING: Convert oracle text to display format
     * Why: Preserve line breaks and mana symbols
     * @param {string} text - Oracle text from Scryfall
     * @returns {string} Formatted card text
     */
    formatCardText(text) {
        return this.escapeHTML(text)
            .replace(/\n/g, '<br>')
            .replace(/\{([^}]+)\}/g, '<span class="mana-symbol">{$1}</span>');
    }

    /**
     * HTML ESCAPING: Safely escape HTML special characters
     * Why: Prevent XSS and ensure proper text display
     * @param {string} str - String to escape
     * @returns {string} HTML-safe string
     */
    escapeHTML(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
}

// Make available globally
window.UpgradeGuideDisplayEngine = UpgradeGuideDisplayEngine;

console.log('✅ UpgradeGuideDisplayEngine loaded successfully');
// upgrade-guide.js - Professional NFD Integration
// EDHREC Upgrade Guide Extraction System with Specific Error Handling

// =============================================================================
// SPECIFIC ERROR CLASSES (No Silent Failures)
// =============================================================================

class EDHRECFetchError extends Error {
    constructor(message, url, proxy) {
        super(`Failed to fetch EDHREC content: ${message}`);
        this.name = 'EDHRECFetchError';
        this.url = url;
        this.proxy = proxy;
    }
}

class EDHRECParseError extends Error {
    constructor(message, element) {
        super(`Failed to parse EDHREC content: ${message}`);
        this.name = 'EDHRECParseError';
        this.element = element;
    }
}

class EDHRECContentError extends Error {
    constructor(message, contentBlocks) {
        super(`EDHREC content extraction failed: ${message}`);
        this.name = 'EDHRECContentError';
        this.contentBlocks = contentBlocks;
    }
}

class EDHRECDisplayError extends Error {
    constructor(message, block) {
        super(`Display failed: ${message}`);
        this.name = 'EDHRECDisplayError';
        this.block = block;
    }
}

// =============================================================================
// EDHREC UPGRADE GUIDE EXTRACTOR (NFD AUTHORITY)
// =============================================================================

class EDHRECUpgradeGuideExtractor {
    constructor() {
        this.proxies = [
            'https://corsproxy.io/?',
            'https://cors-anywhere.herokuapp.com/',
            'https://api.codetabs.com/v1/proxy?quest=',
            ''
        ];
    }

    async extractUpgradeGuide(url) {
        console.log('🔍 EDHREC Upgrade Guide Extraction Started:', url);
        
        try {
            // Step 1: Fetch HTML content
            const htmlContent = await this.fetchWithProxies(url);
            if (!htmlContent) {
                throw new EDHRECFetchError('No HTML content received', url, 'all proxies');
            }

            // Step 2: Parse and extract structured content
            const guideData = this.parseUpgradeGuideContent(htmlContent);
            
            // Step 3: Validate we have meaningful content
            if (!guideData.contentBlocks || guideData.contentBlocks.length === 0) {
                throw new EDHRECContentError('No content blocks found after parsing', []);
            }

            console.log('✅ Upgrade guide extracted successfully:', {
                title: guideData.title,
                blocks: guideData.contentBlocks.length,
                types: this.countContentTypes(guideData.contentBlocks)
            });

            return guideData;
            
        } catch (error) {
            console.error('❌ Upgrade guide extraction failed:', error);
            throw error; // Propagate error - NO FALLBACKS
        }
    }

    async fetchWithProxies(url) {
        let lastError = null;
        
        for (const proxy of this.proxies) {
            try {
                const proxyUrl = proxy + url;
                console.log(`🔄 Attempting fetch with proxy: ${proxy || 'DIRECT'}`);
                
                const response = await fetch(proxyUrl);
                if (!response.ok) {
                    throw new EDHRECFetchError(`HTTP ${response.status}`, url, proxy);
                }
                
                const htmlContent = await response.text();
                console.log('✅ Fetch successful with proxy:', proxy || 'DIRECT');
                return htmlContent;
                
            } catch (error) {
                console.log(`❌ Proxy failed: ${error.message}`);
                lastError = error;
                
                if (proxy !== this.proxies[this.proxies.length - 1]) {
                    await new Promise(resolve => setTimeout(resolve, 300));
                }
            }
        }
        
        throw lastError || new EDHRECFetchError('All proxy attempts failed', url, 'all');
    }

    parseUpgradeGuideContent(htmlContent) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlContent, 'text/html');
        
        const guideData = {
            title: '',
            author: '',
            date: '',
            contentBlocks: [],
            upgradeCards: [] // For card display integration
        };

        // Extract metadata
        this.extractMetadata(doc, guideData);

        // Find main content area with NFD-specific targeting
        const contentElement = doc.querySelector('.ArticlePage_content__j0Z44');
        if (!contentElement) {
            throw new EDHRECParseError('Main content container (.ArticlePage_content__j0Z44) not found');
        }

        // Extract all content blocks using NFD algorithm
        this.extractContentBlocks(contentElement, guideData);

        return guideData;
    }

    extractMetadata(doc, guideData) {
        try {
            // Title extraction
            const titleElement = doc.querySelector('h1') || doc.querySelector('title');
            if (titleElement) {
                guideData.title = this.exactClean(titleElement.textContent.trim());
            } else {
                throw new EDHRECParseError('Could not find article title');
            }

            // Author extraction  
            const authorElement = doc.querySelector('.author, [rel="author"], .byline');
            if (authorElement) {
                guideData.author = this.exactClean(authorElement.textContent.trim());
            }

            // Date extraction
            const dateElement = doc.querySelector('.date, .article-date, time');
            if (dateElement) {
                guideData.date = this.exactClean(dateElement.textContent.trim());
            }

            console.log('📄 Metadata extracted:', guideData);
            
        } catch (error) {
            console.warn('⚠️ Metadata extraction warning:', error.message);
            // Continue without metadata rather than fail completely
        }
    }

    extractContentBlocks(contentElement, guideData) {
        const contentElements = Array.from(contentElement.children);
        
        // NFD Boundary detection
        const boundaryIndex = contentElements.findIndex(el => 
            el.textContent.includes('More Precon Guides:')
        );
        
        const mainContent = boundaryIndex !== -1 ? 
            contentElements.slice(0, boundaryIndex) : contentElements;

        console.log(`🔍 Processing ${mainContent.length} content elements within boundaries`);

        let currentDecklist = null;
        
        mainContent.forEach((element) => {
            try {
                const tagName = element.tagName;
                let text = element.textContent.trim();

                // Skip card display containers (they'll be processed separately)
                if (element.classList.contains('ArticlePage_cards___rqr8')) {
                    this.processCardContainer(element, guideData.upgradeCards);
                    return;
                }

                // Headers (H1-H4)
                if (tagName.match(/^H[1-4]$/) && text.length > 0) {
                    const cleanedText = this.exactClean(text);
                    guideData.contentBlocks.push({
                        type: 'header',
                        level: parseInt(tagName[1]),
                        text: cleanedText
                    });
                }
                // Paragraphs
                else if (tagName === 'P' && text.length > 20) {
                    text = this.exactClean(text);
                    
                    const cardLinks = Array.from(element.querySelectorAll('a[href*="/cards/"]'));
                    const mentionedCards = cardLinks.map(link => 
                        this.exactClean(link.textContent)
                    ).filter(card => card);

                    guideData.contentBlocks.push({
                        type: 'paragraph', 
                        text: text,
                        mentionedCards: mentionedCards,
                        hasCards: mentionedCards.length > 0
                    });
                }
                // Decklists
                else if (element.classList.contains('edhrecp__deck')) {
                    const decklist = this.extractDecklist(element);
                    if (decklist) {
                        guideData.contentBlocks.push(decklist);
                    }
                }

            } catch (error) {
                console.error(`❌ Failed to process element:`, error);
                throw new EDHRECParseError(`Element processing failed: ${error.message}`, element);
            }
        });
    }

    processCardContainer(container, upgradeCards) {
        try {
            const cards = Array.from(container.querySelectorAll('.Card_name__Mpa7S'));
            cards.forEach(card => {
                const cardText = card.textContent;
                if (!cardText) return;
                
                const cleanedCard = this.exactClean(cardText);
                upgradeCards.push(cleanedCard);
            });
        } catch (error) {
            console.error('❌ Card container processing failed:', error);
            throw new EDHRECParseError('Card container processing failed', container);
        }
    }

    extractDecklist(deckElement) {
        try {
            const deckTitle = deckElement.querySelector('h4');
            if (!deckTitle) {
                throw new EDHRECParseError('Deck title not found', deckElement);
            }

            const decklist = {
                type: 'decklist',
                title: this.exactClean(deckTitle.textContent),
                sections: []
            };

            const deckColumns = deckElement.querySelector('.Deck_columns__PVSg8');
            if (!deckColumns) return decklist;

            const sectionHeaders = deckColumns.querySelectorAll('h4');
            
            sectionHeaders.forEach(header => {
                const sectionText = header.textContent.trim();
                if (!sectionText) return;

                const section = {
                    name: this.exactClean(sectionText),
                    cards: []
                };

                let nextElement = header.nextElementSibling;
                while (nextElement && nextElement.tagName !== 'UL') {
                    nextElement = nextElement.nextElementSibling;
                }

                if (nextElement && nextElement.tagName === 'UL') {
                    const listItems = Array.from(nextElement.querySelectorAll('li'));
                    
                    listItems.forEach(li => {
                        const quantityMatch = li.textContent.match(/^(\d+)\s+(.+)/);
                        if (!quantityMatch) return;

                        const quantity = quantityMatch[1];
                        const cardName = this.exactClean(quantityMatch[2]);

                        section.cards.push({
                            quantity: parseInt(quantity),
                            name: cardName
                        });
                    });
                }

                decklist.sections.push(section);
            });

            return decklist;

        } catch (error) {
            console.error('❌ Decklist extraction failed:', error);
            throw new EDHRECParseError('Decklist extraction failed', deckElement);
        }
    }

    // NFD WORKING DUPLICATION CLEANING ALGORITHM
    exactClean(text) {
        if (!text || typeof text !== 'string') return text;
        
        let cleaned = text;
        let changed = true;
        
        while (changed) {
            changed = false;
            
            const boundaryMatch = cleaned.match(/[a-z][A-Z]/);
            if (!boundaryMatch) break;
            
            const boundaryIndex = cleaned.indexOf(boundaryMatch[0]);
            const midWordCapitalIndex = boundaryIndex + 1;
            
            let firstStringEnd = midWordCapitalIndex;
            while (firstStringEnd < cleaned.length && !/\s/.test(cleaned[firstStringEnd])) {
                firstStringEnd++;
            }
            const firstStringAfterBoundary = cleaned.substring(midWordCapitalIndex, firstStringEnd);
            
            let strings = [];
            let currentPos = boundaryIndex;
            
            while (currentPos >= 0) {
                let stringStart = currentPos;
                while (stringStart > 0 && !/\s/.test(cleaned[stringStart - 1])) {
                    stringStart--;
                }
                
                const string = cleaned.substring(stringStart, currentPos + 1);
                strings.unshift(string);
                
                if (string === firstStringAfterBoundary) break;
                
                currentPos = stringStart - 2;
                if (currentPos < 0) break;
            }
            
            const stringCount = strings.length;
            let deletionEnd = midWordCapitalIndex;
            let stringsMatched = 0;
            
            for (let i = 0; i < stringCount; i++) {
                const currentStringStart = deletionEnd;
                while (deletionEnd < cleaned.length && !/\s/.test(cleaned[deletionEnd])) {
                    deletionEnd++;
                }
                
                const currentString = cleaned.substring(currentStringStart, deletionEnd);
                const expectedString = strings[i];
                
                if (i === stringCount - 1) {
                    if (currentString.includes(expectedString)) {
                        stringsMatched++;
                        deletionEnd = currentStringStart + expectedString.length;
                    } else {
                        break;
                    }
                } else {
                    if (currentString === expectedString) {
                        stringsMatched++;
                        deletionEnd++;
                    } else {
                        break;
                    }
                }
            }
            
            if (stringsMatched === stringCount) {
                const before = cleaned.substring(0, midWordCapitalIndex);
                const after = cleaned.substring(deletionEnd);
                cleaned = before + after;
                changed = true;
            }
        }
        
        return cleaned;
    }

    countContentTypes(contentBlocks) {
        const counts = {
            header: 0,
            paragraph: 0,
            decklist: 0
        };
        
        contentBlocks.forEach(block => {
            if (counts.hasOwnProperty(block.type)) {
                counts[block.type]++;
            }
        });
        
        return counts;
    }
}

// =============================================================================
// UPGRADE GUIDE DISPLAY ENGINE (PROFESSIONAL INTEGRATION)
// =============================================================================

class UpgradeGuideDisplayEngine {
    constructor() {
        this.scryfall = new ScryfallAPI();
        this.cardDisplayEngine = new CardDisplayEngine();
        this.cardCache = new Map();
    }

    async displayUpgradeGuide(guideData, container) {
        if (!container) {
            throw new EDHRECDisplayError('No container provided for display');
        }

        console.log('🎨 Rendering upgrade guide:', {
            title: guideData.title,
            blocks: guideData.contentBlocks.length,
            upgradeCards: guideData.upgradeCards.length
        });

        try {
            // Clear container and show guide header
            container.innerHTML = '';
            const header = this.createGuideHeader(guideData);
            container.appendChild(header);

            // Group content blocks for better display
            const groupedBlocks = this.groupContentBlocks(guideData.contentBlocks);
            
            // Process grouped blocks
            for (const group of groupedBlocks) {
                try {
                    const groupElement = await this.createContentGroup(group);
                    if (groupElement) {
                        container.appendChild(groupElement);
                    }
                } catch (error) {
                    console.error(`❌ Group rendering failed:`, error);
                    const errorElement = this.createErrorBlock(group, error);
                    container.appendChild(errorElement);
                }
            }

            // Display upgrade cards using grid layout
            if (guideData.upgradeCards && guideData.upgradeCards.length > 0) {
                await this.displayUpgradeCards(guideData.upgradeCards, container);
            }

            console.log('✅ Upgrade guide rendered successfully');

        } catch (error) {
            console.error('❌ Upgrade guide rendering failed:', error);
            throw new EDHRECDisplayError(`Rendering failed: ${error.message}`);
        }
    }

    // Group consecutive paragraphs together
    groupContentBlocks(contentBlocks) {
        const groups = [];
        let currentGroup = [];

        for (const block of contentBlocks) {
            if (block.type === 'header' || block.type === 'decklist') {
                // Push current group if it has content
                if (currentGroup.length > 0) {
                    groups.push({ type: 'paragraph-group', blocks: currentGroup });
                    currentGroup = [];
                }
                // Push the header or decklist as individual group
                groups.push(block);
            } else if (block.type === 'paragraph') {
                // Add paragraph to current group
                currentGroup.push(block);
            }
        }

        // Don't forget the last group
        if (currentGroup.length > 0) {
            groups.push({ type: 'paragraph-group', blocks: currentGroup });
        }

        return groups;
    }

    createGuideHeader(guideData) {
        const header = document.createElement('div');
        header.className = 'upgrade-guide-header';
        
        const titleElement = document.createElement('h1');
        titleElement.className = 'guide-title';
        titleElement.textContent = guideData.title;
        header.appendChild(titleElement);

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

    async createContentGroup(group) {
        if (group.type === 'paragraph-group') {
            return this.createParagraphGroup(group.blocks);
        } else if (group.type === 'header') {
            return this.createHeaderBlock(group);
        } else if (group.type === 'decklist') {
            return this.createDecklistBlock(group);
        } else {
            console.warn('⚠️ Unknown content group type:', group.type);
            return null;
        }
    }

    createParagraphGroup(paragraphs) {
        const container = document.createElement('div');
        container.className = 'guide-paragraph-group';
        
        paragraphs.forEach(paragraph => {
            const p = document.createElement('p');
            // Preserve line breaks
            p.innerHTML = paragraph.text.replace(/\n/g, '<br>');
            container.appendChild(p);
        });
        
        return container;
    }

    createHeaderBlock(block) {
        const header = document.createElement(`h${block.level}`);
        header.className = `guide-header level-${block.level}`;
        header.textContent = block.text;
        return header;
    }

    createDecklistBlock(block) {
        const container = document.createElement('div');
        container.className = 'guide-cardlist';
        
        const title = document.createElement('h4');
        title.textContent = block.title;
        container.appendChild(title);

        const sectionsContainer = document.createElement('div');
        sectionsContainer.className = 'decklist-section';

        block.sections.forEach(section => {
            const sectionDiv = document.createElement('div');
            
            const sectionHeader = document.createElement('h5');
            sectionHeader.textContent = section.name;
            sectionDiv.appendChild(sectionHeader);

            const list = document.createElement('ul');
            section.cards.forEach(card => {
                const item = document.createElement('li');
                item.textContent = `${card.quantity} ${card.name}`;
                list.appendChild(item);
            });
            sectionDiv.appendChild(list);
            
            sectionsContainer.appendChild(sectionDiv);
        });

        container.appendChild(sectionsContainer);
        return container;
    }

    async displayUpgradeCards(cardNames, container) {
        if (!cardNames || cardNames.length === 0) return;

        console.log(`🃏 Displaying ${cardNames.length} upgrade cards in grid layout`);
        
        try {
            // Create grid container for upgrade cards
            const gridContainer = document.createElement('div');
            gridContainer.className = 'upgrade-cards-grid card-grid columns-4';

            // Create section header
            const sectionHeader = document.createElement('div');
            sectionHeader.className = 'section-header';
            sectionHeader.textContent = `Upgrade Cards (${cardNames.length})`;
            gridContainer.appendChild(sectionHeader);

            // Prepare card data for display engine
            const cardData = cardNames.map(name => ({
                name: name,
                inclusion: 'Upgrade Guide'
            }));

            // Use existing CardDisplayEngine for consistent card frames
            const cardFrames = await this.cardDisplayEngine.createCardFrames(cardData, 'md');
            
            cardFrames.forEach(frame => {
                if (frame instanceof DocumentFragment) {
                    // Handle document fragments
                    while (frame.firstChild) {
                        gridContainer.appendChild(frame.firstChild);
                    }
                } else {
                    gridContainer.appendChild(frame);
                }
            });

            container.appendChild(gridContainer);

        } catch (error) {
            console.error('❌ Upgrade cards display failed:', error);
            throw new EDHRECDisplayError(`Upgrade cards display failed: ${error.message}`);
        }
    }

    createErrorBlock(block, error) {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-message';
        errorDiv.innerHTML = `
            <strong>Content Block Error</strong>
            <p>Type: ${block.type}</p>
            <p>Error: ${error.message}</p>
        `;
        return errorDiv;
    }
}

// =============================================================================
// GLOBAL EXPORTS AND INTEGRATION
// =============================================================================

// Make classes available globally
window.EDHRECUpgradeGuideExtractor = EDHRECUpgradeGuideExtractor;
window.UpgradeGuideDisplayEngine = UpgradeGuideDisplayEngine;

// Error classes for external use
window.EDHRECFetchError = EDHRECFetchError;
window.EDHRECParseError = EDHRECParseError;
window.EDHRECContentError = EDHRECContentError;
window.EDHRECDisplayError = EDHRECDisplayError;

// Main extraction function
async function extractEDHRECUpgradeGuide(url) {
    const extractor = new EDHRECUpgradeGuideExtractor();
    return await extractor.extractUpgradeGuide(url);
}

window.extractEDHRECUpgradeGuide = extractEDHRECUpgradeGuide;

console.log('✅ upgrade-guide.js loaded with professional NFD integration - NO FALLBACKS');

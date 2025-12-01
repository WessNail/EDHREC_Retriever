// VERSION:1
// Card Display Engine - Clean Version
class CardDisplayEngine {
    constructor() {
        this.scryfall = new ScryfallAPI();
        this.cardCache = new Map();
        this.symbolsReady = false;
		console.log('🔄 CardDisplayEngine initialized (symbol support will activate on first use)');
    }

	async initSymbolSupport() {
		// REMOVE the manual initialization - rely on auto-initialization from symbol-manager.js
		// The symbol database auto-initializes on DOM ready, so we don't need to initialize here
		
		// Check if symbol database is available and ready
		if (typeof window.symbolDatabase !== 'undefined' && window.symbolDatabase.initialized) {
			this.symbolsReady = true;
			console.log('Symbol database ready for card display');
		} else {
			console.log('Symbol database not available, using fallback mode');
			this.symbolsReady = false;
			
			// Optional: Wait a bit for auto-initialization to complete
			setTimeout(() => {
				if (window.symbolDatabase && window.symbolDatabase.initialized) {
					this.symbolsReady = true;
					console.log('Symbol database became available after delay');
				}
			}, 1000);
		}
	}

    async createCardFrame(cardData, fontSize = 'md') {
		
		// WAIT FOR SYMBOL SUPPORT BEFORE CREATING ANY CARD
		await this.ensureSymbolsBeforeOperation();
		
        const frame = document.createElement('div');
        frame.className = `card-frame font-size-${fontSize}`;
        
        // Get additional card data from Scryfall
        const fullCardData = await this.enrichCardData(cardData);
        
        // Check if this is a double-faced card
        if (this.isDoubleFacedCard(fullCardData)) {
            return this.createDoubleFacedCardFrame(fullCardData, fontSize);
        }
        
        frame.innerHTML = this.generateCardHTML(fullCardData);
        return frame;
    }

    // Check if card is double-faced
    isDoubleFacedCard(cardData) {
        return cardData.card_faces && 
               cardData.card_faces.length >= 2 && 
               cardData.layout && 
               ['transform', 'modal_dfc', 'double_faced_token'].includes(cardData.layout);
    }

    // Create frame for double-faced cards
    createDoubleFacedCardFrame(cardData, fontSize) {
        // Create a document fragment to hold both cards
        const fragment = document.createDocumentFragment();
        
        // Create front face with indicator
        const frontFrame = document.createElement('div');
        frontFrame.className = `card-frame double-faced-front font-size-${fontSize}`;
        let frontHTML = this.generateCardHTML({
            ...cardData,
            name: cardData.card_faces[0].name,
            mana_cost: cardData.card_faces[0].mana_cost,
            type_line: cardData.card_faces[0].type_line,
            oracle_text: cardData.card_faces[0].oracle_text,
            flavor_text: cardData.card_faces[0].flavor_text,
            power: cardData.card_faces[0].power,
            toughness: cardData.card_faces[0].toughness,
            loyalty: cardData.card_faces[0].loyalty,
            defense: cardData.card_faces[0].defense,
            inclusion: cardData.inclusion,
            price: cardData.price
        });
        // Add face indicator to the front card
        frontHTML = frontHTML.replace('<div class="card-stats">', '<div class="face-indicator front-indicator"><span>FRONT</span> <span>FACE</span></div><div class="card-stats">');
        frontFrame.innerHTML = frontHTML;
        
        // Create back face with indicator
        const backFrame = document.createElement('div');
        backFrame.className = `card-frame double-faced-back font-size-${fontSize}`;
        let backHTML = this.generateCardHTML({
            ...cardData,
            name: cardData.card_faces[1].name,
            mana_cost: cardData.card_faces[1].mana_cost,
            type_line: cardData.card_faces[1].type_line,
            oracle_text: cardData.card_faces[1].oracle_text,
            flavor_text: cardData.card_faces[1].flavor_text,
            power: cardData.card_faces[1].power,
            toughness: cardData.card_faces[1].toughness,
            loyalty: cardData.card_faces[1].loyalty,
            defense: cardData.card_faces[1].defense,
            inclusion: cardData.inclusion,
            price: cardData.price
        });
        // Add face indicator to the back card
        backHTML = backHTML.replace('<div class="card-stats">', '<div class="face-indicator back-indicator"><span>BACK</span> <span>FACE</span></div><div class="card-stats">');
        backFrame.innerHTML = backHTML;
        
        // Add both frames to fragment
        fragment.appendChild(frontFrame);
        fragment.appendChild(backFrame);
        
        return fragment;
    }

	// In display.js - UPDATE the enrichCardData method to improve logging:
	async enrichCardData(cardData) {
		console.log(`🔄 enrichCardData called for: ${cardData.name}`);
		
		// ENSURE symbol support is ready before proceeding
		await this.ensureSymbolSupport();
		
		// Check cache first
		if (this.cardCache.has(cardData.name)) {
			console.log(`✅ Using cached data for: ${cardData.name}`);
			return this.cardCache.get(cardData.name);
		}

		try {
			const scryfallData = await this.scryfall.getCardByName(cardData.name);
			console.log(`✅ Scryfall data retrieved for: ${cardData.name}`, {
				setCode: scryfallData.set,
				setName: scryfallData.set_name
			});
			
			// Get NZD price BEFORE creating enriched data
			const nzdPrice = await this.scryfall.getPriceDisplay(scryfallData.prices, true);
			
			// EXTRACT SET DATA
			const setCode = scryfallData.set || '';
			
			// ALWAYS use Scryfall data for set name and release year
			const setName = scryfallData.set_name || '';
			const releaseYear = scryfallData.released_at ? 
				new Date(scryfallData.released_at).getFullYear().toString() : '';

			// ONLY use symbol database for the symbol URL
			console.log(`🔍 Checking symbol database for set: ${setCode}`);
			console.log(`📊 Symbol database status:`, {
				symbolsReady: this.symbolsReady,
				databaseExists: !!window.symbolDatabase,
				databaseInitialized: window.symbolDatabase?.initialized
			});
			
			let setSymbolUrl = '';
			if (this.symbolsReady && window.symbolDatabase) {
				console.log(`🔍 [DISPLAY] Calling getSetDataWithDownload for: ${setCode}`);
				try {
					const localSetData = await window.symbolDatabase.getSetDataWithDownload(setCode);
					console.log(`📥 [DISPLAY] getSetDataWithDownload result:`, {
						code: localSetData?.code,
						symbolExists: !!localSetData?.symbol,
						symbolLength: localSetData?.symbol?.length,
						symbolValue: localSetData?.symbol ? 'SYMBOL_PRESENT' : 'NO_SYMBOL',
						method: 'getSetDataWithDownload',
						fullData: localSetData // Debug: show the full structure
					});
					setSymbolUrl = localSetData?.symbol || '';
					console.log(`✅ [DISPLAY] Extracted symbol URL: ${setSymbolUrl ? 'FOUND' : 'MISSING'}`);
				} catch (error) {
					console.error(`❌ [DISPLAY] Error getting set data for ${setCode}:`, error);
					setSymbolUrl = '';
				}
			}

			console.log(`🎯 [DISPLAY] Final symbol URL for ${setCode}:`, 
				setSymbolUrl ? `FOUND (${setSymbolUrl.substring(0, 30)}...)` : 'MISSING');

			const enrichedData = {
				...cardData,
				mana_cost: scryfallData.mana_cost,
				type_line: scryfallData.type_line,
				oracle_text: scryfallData.oracle_text,
				flavor_text: scryfallData.flavor_text,
				power: scryfallData.power,
				toughness: scryfallData.toughness,
				loyalty: scryfallData.loyalty,
				defense: scryfallData.defense,
				price: nzdPrice,
				card_faces: scryfallData.card_faces,
				layout: scryfallData.layout,
				set_name: setName,
				set_code: setCode,
				set_symbol: setSymbolUrl,
				release_year: releaseYear
			};
			
			// Cache the result
			this.cardCache.set(cardData.name, enrichedData);
			console.log(`✅ enrichCardData completed for: ${cardData.name}`);
			return enrichedData;
			
		} catch (error) {
			console.error('❌ Error enriching card data:', error);
			// Return basic data if Scryfall fails
			return {
				...cardData,
				type_line: 'Card',
				price: 'Price N/A',
				set_name: '',
				set_code: '',
				set_symbol: '',
				release_year: ''
			};
		}
	}

	// In display.js - REPLACE the getSetSymbol method:
	async getSetSymbol(setCode) {
		console.log(`🔍 getSetSymbol called for set: ${setCode}`);
		if (!setCode) return '';
		
		// Ensure symbol support is ready before attempting database lookup
		const isReady = await this.ensureSymbolSupport();
		
		// Use local symbol database if available AND ready
		if (isReady && window.symbolDatabase) {
			console.log(`✅ Symbol database available, fetching: ${setCode}`);
			try {
				const setData = await window.symbolDatabase.getSetDataWithDownload(setCode);
				console.log(`📊 Set data retrieved for ${setCode}:`, { 
					symbolExists: !!setData.symbol,
					symbolLength: setData.symbol?.length,
					symbolUrl: setData.symbol ? setData.symbol.substring(0, 50) + '...' : 'NO_SYMBOL'
				});
				return setData.symbol || '';
			} catch (error) {
				console.error(`❌ Error getting symbol from database for ${setCode}:`, error);
				return '';
			}
		} else {
			console.log(`❌ Symbol database not available for ${setCode}:`, {
				symbolsReady: this.symbolsReady,
				databaseExists: !!window.symbolDatabase,
				databaseInitialized: window.symbolDatabase?.initialized
			});
		}
		
		return '';
	}

	generateCardHTML(card) {
		console.log(`🔄 generateCardHTML called for: ${card.name}`);
		console.log(`📊 Card symbol data:`, {
			set_symbol: card.set_symbol,
			set_code: card.set_code,
			set_name: card.set_name
		});
		
		// Generate power/toughness/loyalty/defense first
		const ptHTML = this.generatePowerToughness(card);
		
		// Generate set data for left side (with set name - unchanged)
		const setDataHTML = this.generateSetData(card);
		
		// Generate set symbol and code for stats area if available
		const setSymbolHTML = card.set_symbol ? 
			`<img src="${card.set_symbol}" alt="${card.set_name}" class="set-symbol-stats">` : 
			'';
		
		const setCodeHTML = card.set_code ? 
			`<span class="set-code-stats">${this.escapeHTML(card.set_code.toUpperCase())}</span>` : 
			'';
		
		console.log(`🎯 Generated HTML elements:`, {
			setSymbolHTML: setSymbolHTML ? 'SYMBOL_HTML_PRESENT' : 'NO_SYMBOL_HTML',
			setCodeHTML: setCodeHTML ? 'CODE_HTML_PRESENT' : 'NO_CODE_HTML'
		});
		
		return `
			<div class="card-header">
				<h3 class="card-name">${this.escapeHTML(card.name)}</h3>
				${card.mana_cost ? `<span class="card-mana-cost">${this.formatManaCost(card.mana_cost)}</span>` : ''}
			</div>
			<div class="card-type-line">${this.escapeHTML(card.type_line)}</div>
			<div class="card-content">
				${card.oracle_text ? `<div class="card-text">${this.formatCardText(card.oracle_text)}</div>` : ''}
				${card.flavor_text ? `<div class="card-flavor-text">${this.escapeHTML(card.flavor_text)}</div>` : ''}
				${setDataHTML ? `<div class="card-set-container">${setDataHTML}</div>` : ''}
				${ptHTML ? `<div class="card-pt-container">${ptHTML}</div>` : ''}
			</div>
			<div class="card-stats">
				${setSymbolHTML}
				${setCodeHTML}
				<span class="stats-gap"></span>
				<span class="inclusion-percentage">${card.inclusion}</span>
				<span class="card-price">${card.price}</span>
			</div>
		`;
	}
	
	// Generate set data display
	generateSetData(card) {
		if (!card.set_name && !card.release_year) {
			return '';
		}
		
		const yearHTML = card.release_year ? 
			`<span class="release-year">${this.escapeHTML(card.release_year)}</span>` : 
			'';
		
		const setNameHTML = card.set_name ? 
			`<span class="set-name">${this.escapeHTML(card.set_name)}</span>` : 
			'';		
		
		// Only show if we have at least one piece of data
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

    formatManaCost(manaCost) {
        // Simple formatting - in a real implementation you'd want mana symbols
        return manaCost.replace(/\{([^}]+)\}/g, '$1');
    }

    formatCardText(text) {
        return this.escapeHTML(text)
            .replace(/\n/g, '<br>')
            .replace(/\{([^}]+)\}/g, '<span class="mana-symbol">{$1}</span>');
    }

    generatePowerToughness(card) {
        if (card.power && card.toughness) {
            return `${card.power}/${card.toughness}`;
        }
        if (card.loyalty) {
            return card.loyalty;
        }
        if (card.defense) {
            return card.defense;
        }
        return '';
    }

    escapeHTML(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // Batch process cards for better performance
    async createCardFrames(cards, fontSize = 'md') {
        const frames = [];
        
        // Process in small batches to avoid overwhelming the API
        const batchSize = 5;
        for (let i = 0; i < cards.length; i += batchSize) {
            const batch = cards.slice(i, i + batchSize);
            const batchFrames = await Promise.all(
                batch.map(card => this.createCardFrame(card, fontSize))
            );
            frames.push(...batchFrames);
			
			// ADD HEALTH CHECK AFTER EACH BATCH
			this.checkSymbolHealth(batchFrames);
            
            // Small delay between batches to be respectful to the API
            if (i + batchSize < cards.length) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }
        
        return frames;
    }
	
	// In display.js - REPLACE the ensureSymbolSupport method:
	async ensureSymbolSupport() {
		if (this.symbolsReady) return true;
		
		// If symbol database doesn't exist at all, skip
		if (typeof window.symbolDatabase === 'undefined') {
			console.log('Symbol database not available in this environment');
			this.symbolsReady = false;
			return false;
		}
		
		// If database is already initialized, we're ready
		if (window.symbolDatabase.initialized) {
			this.symbolsReady = true;
			console.log('✅ Symbol database ready for card display');
			return true;
		}
		
		// Wait for initialization to complete with timeout
		console.log('⏳ Waiting for symbol database initialization...');
		return new Promise((resolve) => {
			let attempts = 0;
			const maxAttempts = 50; // 5 second timeout (50 * 100ms)
			
			const checkInitialized = () => {
				attempts++;
				
				if (window.symbolDatabase.initialized) {
					this.symbolsReady = true;
					console.log('✅ Symbol database initialization completed - ready for use');
					resolve(true);
				} else if (attempts >= maxAttempts) {
					console.log('⏰ Symbol database initialization timeout, proceeding without symbols');
					this.symbolsReady = false;
					resolve(false);
				} else {
					setTimeout(checkInitialized, 100);
				}
			};
			
			checkInitialized();
		});
	}
	
	async ensureSymbolsBeforeOperation() {
		if (!this.symbolsReady) {
			console.log('⏳ Symbols not ready, waiting...');
			await this.ensureSymbolSupport();
		}
		return true;
	}
	
	checkSymbolHealth(cardFrames) {
		const symbols = [];
		cardFrames.forEach(frame => {
			const symbol = frame.querySelector?.('.set-symbol-stats');
			if (symbol) {
				symbols.push({
					element: symbol,
					naturalWidth: symbol.naturalWidth,
					naturalHeight: symbol.naturalHeight,
					format: symbol.src.includes('image/png') ? 'PNG' : 'SVG'
				});
			}
		});
		
		const stats = {
			total: symbols.length,
			png: symbols.filter(s => s.format === 'PNG').length,
			svg: symbols.filter(s => s.format === 'SVG').length,
			broken: symbols.filter(s => s.naturalWidth < 10 || s.naturalHeight < 10).length
		};
		
		if (stats.broken > 0) {
			console.warn(`⚠️ Symbol Health: ${stats.broken}/${stats.total} symbols appear broken`);
		}
		
		console.log(`📊 Symbol Health: ${stats.png} PNG, ${stats.svg} SVG, ${stats.broken} broken`);
		return stats;
	}
}

window.CardDisplayEngine = CardDisplayEngine;

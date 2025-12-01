// VERSION:1
// Scryfall API Integration Module
class ScryfallAPI {
    constructor() {
        this.baseURL = 'https://api.scryfall.com';
        this.searchDelay = 300; // ms delay between searches
        this.currentSearch = null;
		
		// NZD Conversion Configuration
        this.nzdRate = null;
        this.rateCacheKey = 'nzd_exchange_rate';
        this.cacheDuration = 24 * 60 * 60 * 1000; // 24 hours
    }
	
	// NEW: NZD Currency Conversion Method
    async getNZDExchangeRate() {
        // Check cache first
        const cached = this.getCachedRate();
        if (cached) {
            return cached;
        }

        // API endpoints to try in order of preference
        const apiEndpoints = [
            {
                name: 'Frankfurter.app',
                url: 'https://api.frankfurter.app/latest?from=USD&to=NZD',
                parser: (data) => data.rates?.NZD
            },
            {
                name: 'ExchangeRate-API',
                url: 'https://api.exchangerate-api.com/v4/latest/USD',
                parser: (data) => data.rates?.NZD
            },
            {
                name: 'ExchangeAPI.host',
                url: 'https://api.exchangerate.host/latest?base=USD&symbols=NZD',
                parser: (data) => data.rates?.NZD
            }
        ];

        // Try each API sequentially
        for (const api of apiEndpoints) {
            try {
                const rate = await this.tryExchangeAPI(api);
                if (rate && rate > 0) {
                    this.cacheRate(rate);
                    return rate;
                }
            } catch (error) {
                continue; // Try next API
            }
        }

        // All APIs failed, use fixed rate with indicator
        return 1.65; // Fixed fallback rate
    }

    // NEW: Try individual exchange API
    async tryExchangeAPI(api) {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('API timeout'));
            }, 2000);

            fetch(api.url)
                .then(response => {
                    clearTimeout(timeout);
                    if (!response.ok) throw new Error(`HTTP ${response.status}`);
                    return response.json();
                })
                .then(data => {
                    const rate = api.parser(data);
                    if (rate && typeof rate === 'number' && rate > 0) {
                        resolve(rate);
                    } else {
                        reject(new Error('Invalid rate data'));
                    }
                })
                .catch(error => {
                    clearTimeout(timeout);
                    reject(error);
                });
        });
    }

    // NEW: Cache management methods
    getCachedRate() {
        try {
            const cached = localStorage.getItem(this.rateCacheKey);
            if (cached) {
                const { rate, timestamp } = JSON.parse(cached);
                if (Date.now() - timestamp < this.cacheDuration) {
                    return rate;
                }
            }
        } catch (error) {
            console.log('Cache read failed:', error);
        }
        return null;
    }

    cacheRate(rate) {
        try {
            const cacheData = {
                rate: rate,
                timestamp: Date.now()
            };
            localStorage.setItem(this.rateCacheKey, JSON.stringify(cacheData));
        } catch (error) {
            console.log('Cache write failed:', error);
        }
    }

	// UPDATED: Get price display with BOTH USD and NZD
	async getPriceDisplay(prices, showBothCurrencies = true) {
		if (!prices) {
			return 'Price N/A';
		}
		
		// Get USD prices - ONLY USE REGULAR USD PRICE
		const usd = prices.usd;
		
		if (!showBothCurrencies) {
			// Return USD format (existing behavior)
			return usd ? `$${usd}` : 'Price N/A';
		}
		
		// DUAL CURRENCY: USD + NZD - NO FOIL/ETCHED
		try {
			const nzdRate = await this.getNZDExchangeRate();
			const usingFixedRate = nzdRate === 1.65; // Check if using fallback
			
			return this.formatDualCurrencyPrice(usd, nzdRate, usingFixedRate);
			
		} catch (error) {
			console.error('Dual currency conversion failed:', error);
			// Fallback to USD-only
			return usd ? `$${usd}` : 'Price N/A';
		}
	}

	// NEW: Format dual currency price
	formatDualCurrencyPrice(usdPrice, nzdRate, usingFixedRate = false) {
		if (!usdPrice || usdPrice === 'N/A') {
			return 'Price N/A';
		}
		
		try {
			const usd = parseFloat(usdPrice);
			if (isNaN(usd)) {
				return 'Price N/A';
			}
			
			const nzd = (usd * nzdRate).toFixed(2);
			const fallbackIndicator = usingFixedRate ? '*' : '';
			return `USD $${usdPrice}<br>NZD $${nzd}${fallbackIndicator}`;
			
		} catch (error) {
			console.error('Error formatting dual currency price:', error);
			return 'Price N/A';
		}
	}

    // NEW: Format NZD price with asterisk for fallback rates
    formatNZDPrice(usdPrice, nzdRate, usingFixedRate = false) {
        if (!usdPrice) return 'NZD N/A';
        
        try {
            const usd = parseFloat(usdPrice);
            if (isNaN(usd)) return 'NZD N/A';
            
            const nzd = (usd * nzdRate).toFixed(2);
            const fallbackIndicator = usingFixedRate ? '*' : '';
            return `NZD $${nzd}${fallbackIndicator}`;
        } catch (error) {
            return 'NZD N/A';
        }
    }

    // Search for cards with autocomplete
    async searchCards(query) {
        if (!query || query.length < 2) {
            return [];
        }

        // Cancel previous search if new one comes in
        if (this.currentSearch) {
            clearTimeout(this.currentSearch);
        }

        return new Promise((resolve) => {
            this.currentSearch = setTimeout(async () => {
                try {
                    const response = await fetch(
                        `${this.baseURL}/cards/search?q=${encodeURIComponent(query)}&unique=cards&order=name`
                    );
                    
                    if (!response.ok) {
                        throw new Error('Scryfall API error');
                    }
                    
                    const data = await response.json();
                    resolve(data.data || []);
                } catch (error) {
                    console.error('Scryfall search error:', error);
                    resolve([]);
                }
            }, this.searchDelay);
        });
    }

    // Get specific card by name
    async getCardByName(cardName) {
        try {
            const response = await fetch(
                `${this.baseURL}/cards/named?fuzzy=${encodeURIComponent(cardName)}`
            );
            
            if (!response.ok) {
                throw new Error('Card not found');
            }
            
            return await response.json();
        } catch (error) {
            console.error('Error fetching card:', error);
            throw error;
        }
    }

    // Get card by exact name
    async getCardExact(cardName) {
        try {
            const response = await fetch(
                `${this.baseURL}/cards/named?exact=${encodeURIComponent(cardName)}`
            );
            
            if (!response.ok) {
                throw new Error('Card not found');
            }
            
            return await response.json();
        } catch (error) {
            console.error('Error fetching card:', error);
            throw error;
        }
    }

    // Check if card is a valid commander
    isCommanderLegal(card) {
        // Must be legendary
        if (!card.type_line?.toLowerCase().includes('legendary')) {
            return false;
        }

        // Must be a creature, planeswalker, or battle (if applicable)
        const validTypes = ['creature', 'planeswalker', 'battle'];
        const hasValidType = validTypes.some(type => 
            card.type_line?.toLowerCase().includes(type)
        );

        if (!hasValidType) {
            return false;
        }

        // Check if banned as commander (simplified check)
        const bannedCommanders = [
            // Add known banned commanders if needed
        ];

        if (bannedCommanders.includes(card.name.toLowerCase())) {
            return false;
        }

        return true;
    }

    // Format card data for display
    formatCardData(card) {
        return {
            name: card.name,
            mana_cost: card.mana_cost,
            type_line: card.type_line,
            oracle_text: card.oracle_text,
            flavor_text: card.flavor_text,
            power: card.power,
            toughness: card.toughness,
            loyalty: card.loyalty,
            defense: card.defense,
            colors: card.colors,
            color_identity: card.color_identity,
            legalities: card.legalities,
            prices: card.prices,
            image_uris: card.image_uris,
            scryfall_uri: card.scryfall_uri
        };
    }
}

// Export for use in other modules
window.ScryfallAPI = ScryfallAPI;

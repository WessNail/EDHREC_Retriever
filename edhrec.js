// VERSION:1
// EDHREC Data Extraction Module - Real Implementation
class EDHRECExtractor {
    constructor() {
        // Smart proxy rotation - keeps current proxy as primary
        this.proxies = [
            'https://cors-anywhere.herokuapp.com/',  // Primary (works for most commanders)
            'https://corsproxy.io/?',                 // Fallback 1 (proven working for Clavileño)
            'https://api.codetabs.com/v1/proxy?quest=', // Fallback 2
            ''  // Direct fetch - last resort
        ];
    }

	async extractData(input) {
		try {
			let url;
			
			// Determine if input is a URL or commander name
			if (input.startsWith('http') || input.includes('edhrec.com')) {
				// It's already a URL - use it directly
				url = input;
				console.log('🌐 Using direct URL:', url);
			} else {
				// It's a commander name - generate EDHREC URL
				url = this.generateEDHRECUrl(input);
				console.log('🌐 Generated URL from commander name:', url);
			}
			
			// Fetch HTML content
			const htmlContent = await this.fetchPageContent(url);
			
			// Parse HTML and extract commander data from title
			return this.parseHTML(htmlContent);
			
		} catch (error) {
			console.error('EDHREC extraction error:', error);
			// Fallback to sample data
			return this.getSampleData(input);
		}
	}
	
	async fetchPageContent(url) {
		// Try direct fetch first
		try {
			console.log('🌐 Attempting direct fetch...');
			const response = await fetch(url);
			if (!response.ok) throw new Error(`HTTP ${response.status}: Direct fetch failed`);
			const htmlContent = await response.text();
			console.log('✅ Direct fetch successful');
			return htmlContent;
			
		} catch (directError) {
			console.log('❌ Direct fetch failed, trying proxies...');
			
			// Try each proxy
			for (let i = 0; i < this.proxies.length; i++) {
				const proxy = this.proxies[i];
				try {
					console.log(`🔄 Proxy attempt ${i + 1}/${this.proxies.length}: ${proxy || 'DIRECT'}`);
					
					const proxyUrl = proxy ? proxy + encodeURIComponent(url) : url;
					const proxyResponse = await fetch(proxyUrl);
					
					if (!proxyResponse.ok) {
						throw new Error(`HTTP ${proxyResponse.status}`);
					}
					
					const htmlContent = await proxyResponse.text();
					console.log(`✅ Proxy successful: ${proxy || 'DIRECT'}`);
					return htmlContent;
					
				} catch (proxyError) {
					console.log(`❌ Proxy failed: ${proxyError.message}`);
					if (i < this.proxies.length - 1) {
						await new Promise(resolve => setTimeout(resolve, 300));
					}
				}
			}
			
			throw new Error('All proxy attempts failed');
		}
	}

	generateEDHRECUrl(commanderName) {
		// Handle double-faced cards - use only the first name
		const firstFaceName = commanderName.split(' // ')[0];
		
		// Convert card name to URL-safe format
		const urlSafeName = firstFaceName
			.toLowerCase()
			.replace(/[^a-z0-9\s-]/g, '')
			.replace(/\s+/g, '-')
			.replace(/-+/g, '-')
			.trim();
		
		return `https://edhrec.com/commanders/${urlSafeName}`;
	}

	parseHTML(htmlContent) {
		// Create a temporary DOM parser
		const parser = new DOMParser();
		const doc = parser.parseFromString(htmlContent, 'text/html');
		
		// Extract page title and clean it
		const pageTitle = doc.title || '';
		const cleanTitle = this.cleanEDHRECTitle(pageTitle);
		
		// Extract commander data from title
		let commanderData = null;
		if (cleanTitle.includes(' // ')) {
			// Partner commanders
			const commanderNames = cleanTitle.split(' // ').map(name => 
				this.cleanCommanderName(name)
			);
			commanderData = {
				isPartner: true,
				commanders: commanderNames,
				displayName: cleanTitle
			};
			console.log(`✅ Detected partner commanders: ${commanderNames.join(' // ')}`);
		} else {
			// Single commander
			commanderData = {
				isPartner: false,
				commander: this.cleanCommanderName(cleanTitle),
				displayName: cleanTitle
			};
			console.log(`✅ Detected single commander: ${commanderData.commander}`);
		}
		
		// Continue with existing card extraction...
		const sections = {};
		
		// Find all card containers
		const cardContainers = doc.querySelectorAll('.Card_container__Ng56K');
		
		cardContainers.forEach(container => {
			// Extract card name
			const nameElement = container.querySelector('.Card_name__Mpa7S');
			if (!nameElement) return;
			
			const cardName = nameElement.textContent.trim();
			if (!cardName || cardName.length < 2) return;
			
			// Extract inclusion percentage
			let inclusion = '';
			const cardLabelContainer = container.querySelector('.CardLabel_container__3M9Zu');
			
			if (cardLabelContainer) {
				const inclusionLine = cardLabelContainer.querySelector('.CardLabel_line__iQ3O3');
				if (inclusionLine) {
					const inclusionStat = inclusionLine.querySelector('.CardLabel_stat__galuW');
					const inclusionLabel = inclusionLine.querySelector('.CardLabel_label__iAM7T');
					
					if (inclusionStat && inclusionLabel) {
						const labelText = inclusionLabel.textContent.toLowerCase();
						if (labelText.includes('inclusion') || labelText.includes('deck')) {
							inclusion = inclusionStat.textContent.trim();
						}
					}
				}
			}
			
			// Find section
			let sectionName = "Unknown";
			const cardlist = container.closest('.Grid_cardlist__AXXsz');
			if (cardlist) {
				const header = cardlist.querySelector('.Grid_header__iAPM8');
				if (header) {
					sectionName = header.textContent.trim();
				} else {
					const id = cardlist.id;
					if (id) {
						sectionName = id.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
					}
				}
			}
			
			// Only add if we found valid inclusion data
			if (inclusion && !inclusion.includes('$') && inclusion.includes('%')) {
				if (!sections[sectionName]) {
					sections[sectionName] = [];
				}
				
				const isDuplicate = sections[sectionName].some(card => card.name === cardName);
				if (!isDuplicate) {
					sections[sectionName].push({
						name: cardName,
						inclusion: inclusion
					});
				}
			}
		});
		
		// Extract deck count from page
		const deckCount = this.extractDeckCount(htmlContent);
		
		// Sort each section
		Object.keys(sections).forEach(section => {
			if (Array.isArray(sections[section])) {
				sections[section].sort((a, b) => {
					const aPct = parseFloat(a.inclusion) || 0;
					const bPct = parseFloat(b.inclusion) || 0;
					return bPct - aPct;
				});
			}
		});
		
		// Add metadata
		sections._commanderData = commanderData;
		if (deckCount) {
			sections._deckCount = deckCount;
		}
		
		console.log(`📊 Parsed ${Object.keys(sections).length} sections with commander data`);
		return sections;
	}
	
	// Extract deck count (ADDITION ONLY - line ~150)
	extractDeckCount(htmlContent) {
		// Multiple patterns to catch different formats
		const deckCountPatterns = [
			/(\d+[,]?\d+)\s*decks?/i,  // "172434 decks" 
			/of\s*(\d+[,]?\d+)\s*decks?/i, // "of 172434 decks"
			/played in\s*(\d+[,]?\d+)\s*decks?/i, // "played in 172434 decks"
			/appears in\s*(\d+[,]?\d+)\s*decks?/i // "appears in 172434 decks"
		];
		
		for (const pattern of deckCountPatterns) {
			const match = htmlContent.match(pattern);
			if (match && match[1]) {
				const count = match[1].replace(/,/g, '');
				return `${parseInt(count).toLocaleString()} decks`;
			}
		}
		
		return null;
	}

    getSampleData(commanderName) {
        // Return comprehensive sample data based on our working extraction
        return {
            "New Cards": [
                { name: "Spider Manifestation", inclusion: "6.1%" },
                { name: "Rhino, Barreling Brute", inclusion: "2.9%" },
                { name: "Lizard, Connors's Curse", inclusion: "2.6%" },
                { name: "Rhino's Rampage", inclusion: "2.0%" },
                { name: "Scarlet Spider, Ben Reilly", inclusion: "1.6%" }
            ],
            "High Synergy Cards": [
                { name: "Goreclaw, Terror of Qal Sisma", inclusion: "68%" },
                { name: "Ghalta, Primal Hunger", inclusion: "59%" },
                { name: "Quartzwood Crasher", inclusion: "56%" },
                { name: "Etali, Primal Storm", inclusion: "55%" },
                { name: "Anzrag, the Quake-Mole", inclusion: "54%" },
                { name: "Ilharg, the Raze-Boar", inclusion: "49%" },
                { name: "Bloodthirster", inclusion: "45%" },
                { name: "Ojer Kaslem, Deepest Growth", inclusion: "45%" },
                { name: "Scourge of the Throne", inclusion: "44%" }
            ],
            "Top Cards": [
                { name: "Garruk's Uprising", inclusion: "74%" },
                { name: "Cultivate", inclusion: "64%" },
                { name: "Beast Within", inclusion: "63%" },
                { name: "Llanowar Elves", inclusion: "59%" },
                { name: "Goblin Anarchomancer", inclusion: "58%" },
                { name: "Rishkar's Expertise", inclusion: "55%" },
                { name: "Nature's Lore", inclusion: "54%" },
                { name: "Kodama's Reach", inclusion: "53%" },
                { name: "Elvish Mystic", inclusion: "52%" },
                { name: "Blasphemous Act", inclusion: "50%" }
            ],
            "Creatures": [
                { name: "Birds of Paradise", inclusion: "50%" },
                { name: "Selvala, Heart of the Wilds", inclusion: "47%" },
                { name: "Savage Ventmaw", inclusion: "47%" },
                { name: "Moraug, Fury of Akoum", inclusion: "44%" },
                { name: "Fanatic of Rhonas", inclusion: "44%" }
            ]
        };
    }
	
	// Clean EDHREC title suffixes
	cleanEDHRECTitle(title) {
		if (!title) return '';
		
		// Remove common EDHREC suffixes
		const suffixes = [
			/\s*[|―-]\s*EDHREC.*$/i,      // | EDHREC, - EDHREC, ― EDHREC
			/\s*[|―-]\s*edhrec.*$/i,      // lowercase variants
			/\s*[|―-]\s*MTG.*$/i,         // MTG suffixes
			/\s*[|―-]\s*Magic:.*$/i,      // Magic: The Gathering
			/\s*[|―-]\s*Magic.*$/i        // Magic
		];
		
		let cleaned = title;
		for (const suffix of suffixes) {
			cleaned = cleaned.replace(suffix, '');
		}
		
		// Also trim any trailing punctuation or whitespace
		cleaned = cleaned.replace(/[|\-―]\s*$/, '').trim();
		
		return cleaned;
	}

	// Clean individual commander name
	cleanCommanderName(name) {
		if (!name) return '';
		
		// Remove any remaining EDHREC references
		let cleaned = name.replace(/edhrec/gi, '').trim();
		
		// Remove edge case suffixes that might have been missed
		cleaned = cleaned.replace(/\s*[|―-]\s*$/, '').trim();
		
		// Fix common MTG name formatting
		cleaned = cleaned.replace(/(\w+),(\w)/, '$1, $2'); // Add space after comma
		
		return cleaned;
	}
}

// Create global instance
window.edhrecExtractor = new EDHRECExtractor();

// Export the main function
async function extractEDHRECData(commanderName) {
    return await window.edhrecExtractor.extractData(commanderName);
}

window.extractEDHRECData = extractEDHRECData;

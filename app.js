// VERSION:2
// ============================================================================
// COMMANDER STATE MANAGER - Unified handling for all commander types
// ============================================================================
class CommanderStateManager {
    constructor() {
        this.reset();
    }
    
    reset() {
        this.type = 'unknown'; // 'single', 'partner', 'double-faced'
        this.source = 'unknown'; // 'url', 'selection', 'file'
        this.displayName = '';
        this.scryfallData = []; // Array of commander objects from Scryfall
        this.metadata = {
            url: null,
            deckCount: null,
            fetchTime: null
        };
    }
    
    // Set from EDHREC URL after page fetch
    setFromEDHRECPage(edhrecData, url = null) {
        this.reset();
        this.source = 'url';
        this.metadata.url = url;
        this.metadata.deckCount = edhrecData._deckCount;
        this.metadata.fetchTime = Date.now();
        
        if (edhrecData._commanderData) {
            const cmdData = edhrecData._commanderData;
            
            if (cmdData.isPartner) {
                this.type = 'partner';
                this.displayName = cmdData.displayName;
                // Store raw names for later Scryfall fetch
                this.metadata.rawNames = cmdData.commanders;
            } else {
                this.type = 'single';
                this.displayName = cmdData.displayName;
                this.metadata.rawNames = [cmdData.commander];
            }
        } else {
            // Fallback if no commander data
            this.type = 'single';
            this.displayName = 'Commander from URL';
        }
        
        console.log(`✅ Commander state set from EDHREC:`, {
            type: this.type,
            displayName: this.displayName,
            rawNames: this.metadata.rawNames
        });
    }
    
    // Set from manual selection
    setFromSelection(card) {
        this.reset();
        this.source = 'selection';
        this.type = 'single';
        this.displayName = card.name;
        this.scryfallData = [card]; // Already has Scryfall data
        console.log(`✅ Commander state set from selection: ${card.name}`);
    }
    
    // Set from file upload
    setFromFile() {
        this.reset();
        this.source = 'file';
        this.type = 'custom';
        this.displayName = 'Custom List';
        console.log(`✅ Commander state set from file`);
    }
    
    // Fetch commander data from Scryfall (for URL sources)
    async fetchScryfallData() {
        if (this.source !== 'url' || !this.metadata.rawNames || this.metadata.rawNames.length === 0) {
            console.log('⏭️ No Scryfall fetch needed');
            return this.scryfallData;
        }
        
        console.log(`🔄 Fetching ${this.metadata.rawNames.length} commander(s) from Scryfall:`, this.metadata.rawNames);
        
        const scryfallAPI = new ScryfallAPI();
        const fetchPromises = this.metadata.rawNames.map(async (name) => {
            try {
                const card = await scryfallAPI.getCardByName(name);
                const price = await scryfallAPI.getPriceDisplay(card.prices, true);
                
                return {
                    ...card,
                    price: price,
                    inclusion: this.metadata.deckCount || 'Commander'
                };
            } catch (error) {
                console.error(`❌ Failed to fetch commander ${name}:`, error);
                // Create fallback data
                return {
                    name: name,
                    type_line: 'Commander',
                    price: 'Price N/A',
                    inclusion: this.metadata.deckCount || 'Commander',
                    error: error.message
                };
            }
        });
        
        this.scryfallData = await Promise.all(fetchPromises);
        
        // Check for failures
        const successful = this.scryfallData.filter(cmd => !cmd.error);
        const failed = this.scryfallData.filter(cmd => cmd.error);
        
        console.log(`📊 Scryfall fetch results: ${successful.length} success, ${failed.length} failed`);
        
        if (successful.length === 0) {
            throw new Error(`Failed to fetch any commanders: ${failed.map(f => f.name).join(', ')}`);
        }
        
        return this.scryfallData;
    }
    
    // Get commander for display (compatible with existing code)
    getCurrentCommander() {
        if (this.type === 'single' && this.scryfallData.length > 0) {
            return this.scryfallData[0]; // Single commander object
        }
        
        // For partners or no data, return a composite object
        return {
            name: this.displayName,
            isPartner: this.type === 'partner',
            partners: this.scryfallData,
            type: this.type,
            source: this.source
        };
    }
    
    // Get display name for UI
    getDisplayName() {
        return this.displayName;
    }
    
    // Check if ready for display
    isReady() {
        if (this.source === 'selection') {
            return this.scryfallData.length > 0;
        }
        if (this.source === 'url') {
            return this.scryfallData.length > 0;
        }
        return true;
    }
    
    // Get data for commander section in card display
    getCommanderSectionData() {
        if (this.type === 'partner') {
            return {
                "Partner Commanders": this.scryfallData.map(cmd => ({
                    name: cmd.name,
                    inclusion: this.metadata.deckCount || 'Commander',
                    mana_cost: cmd.mana_cost,
                    type_line: cmd.type_line,
                    oracle_text: cmd.oracle_text,
                    flavor_text: cmd.flavor_text,
                    power: cmd.power,
                    toughness: cmd.toughness,
                    loyalty: cmd.loyalty,
                    defense: cmd.defense,
                    price: cmd.price,
                    card_faces: cmd.card_faces,
                    layout: cmd.layout,
                    is_partner: true
                }))
            };
        } else if (this.type === 'single' && this.scryfallData.length > 0) {
            const cmd = this.scryfallData[0];
            return {
                "Commander": [{
                    name: cmd.name,
                    inclusion: this.metadata.deckCount || 'Commander',
                    mana_cost: cmd.mana_cost,
                    type_line: cmd.type_line,
                    oracle_text: cmd.oracle_text,
                    flavor_text: cmd.flavor_text,
                    power: cmd.power,
                    toughness: cmd.toughness,
                    loyalty: cmd.loyalty,
                    defense: cmd.defense,
                    price: cmd.price,
                    card_faces: cmd.card_faces,
                    layout: cmd.layout
                }]
            };
        }
        
        return {};
    }
}

// Main Application Class with Comprehensive Debugging
class App {
    constructor() {
        
        this.currentCommander = null;
        this.cardData = null;
        this.fontSize = 'md';
        this.displayEngine = null;
		this.contentType = null;
		
		// Commander state manager
		this.commanderState = new CommanderStateManager();
        
        this.initializeElements();
        this.initializeEventListeners();
        this.initializeModules();
    }

    initializeElements() {
        this.cardSearch = document.getElementById('cardSearch');
        this.searchResults = document.getElementById('searchResults');
        this.generateBtn = document.getElementById('generateBtn');
        this.cardGrid = document.getElementById('cardGrid');
        this.loadingSpinner = document.getElementById('loadingSpinner');
        this.errorMessage = document.getElementById('errorMessage');
        this.statusMessage = document.getElementById('statusMessage');
        
        this.loadBtn = document.getElementById('loadBtn');
        this.downloadTextBtn = document.getElementById('downloadTextBtn');
        this.generatePdfBtn = document.getElementById('generatePdfBtn');
        this.printBtn = document.getElementById('printBtn');
        this.sizeDown = document.getElementById('sizeDown');
        this.sizeUp = document.getElementById('sizeUp');
        this.sizeDisplay = document.getElementById('sizeDisplay');
        this.fileInput = document.getElementById('fileInput');
        this.pdfCutoff = document.getElementById('pdfCutoff');
    }

    initializeEventListeners() {
        try {
            if (this.cardSearch) {
                this.cardSearch.addEventListener('input', (e) => {
                    this.handleSearchInput(e);
                });
				
				this.setupSearchDropdown();
            }

            if (this.generateBtn) {
                this.generateBtn.addEventListener('click', () => {
                    this.generateList();
                });
            }

            if (this.loadBtn) {
                this.loadBtn.addEventListener('click', () => {
                    this.loadList();
                });
            }

            if (this.downloadTextBtn) {
                this.downloadTextBtn.addEventListener('click', () => {
                    this.downloadText();
                });
            }

            if (this.generatePdfBtn) {
                this.generatePdfBtn.addEventListener('click', () => {
                    this.generatePdf();
                });
            }

            if (this.printBtn) {
                this.printBtn.addEventListener('click', () => {
                    this.printList();
                });
            }

            if (this.sizeDown) {
                this.sizeDown.addEventListener('click', () => {
                    this.decreaseFontSize();
                });
            }

            if (this.sizeUp) {
                this.sizeUp.addEventListener('click', () => {
                    this.increaseFontSize();
                });
            }
			
			// ADD THIS EVENT LISTENER for PDF cutoff filter:
			if (this.pdfCutoff) {
				this.pdfCutoff.addEventListener('change', (e) => {
					const value = parseInt(e.target.value);
					if (value < 0) e.target.value = 0;
					if (value > 100) e.target.value = 100;
				});
			}

            if (this.fileInput) {
                this.fileInput.addEventListener('change', (e) => {
                    this.handleFileSelect(e);
                });
            }

        } catch (error) {
            if (this.debug && this.debug.error) {
                this.debug.error('Error initializing event listeners', error);
            }
        }
    }

	initializeModules() {
		try {
			if (typeof CardDisplayEngine !== 'undefined') {
				this.displayEngine = new CardDisplayEngine();
				
				// CACHE VERSION CHECK
				this.checkSymbolCacheVersion();
			}
		} catch (error) {
			// REMOVED debug system reference - just log to console
			console.error('Error initializing modules', error);
		}
	}

	// [REPLACE the current handleSearchInput method in app.js - around line 200]
	async handleSearchInput(event) {
		const query = event.target.value.trim();

		// ENHANCED: Handle BOTH commander URLs AND upgrade guide URLs
		if (query.startsWith('http') || query.includes('edhrec.com')) {
			this.hideSearchResults();
			
			// Check for BOTH URL types
			const urlCommander = this.extractCommanderFromURL(query);
			const isUpgradeGuide = this.isUpgradeGuideURL(query);
			
			if (urlCommander || isUpgradeGuide) {
				console.log(`🎯 URL detected, enabling generate button:`, {
					isCommander: !!urlCommander,
					isUpgradeGuide: isUpgradeGuide,
					url: query
				});
				
				if (this.generateBtn) {
					this.generateBtn.disabled = false;
				}
				
				if (isUpgradeGuide) {
					this.showStatus(`Ready to generate upgrade guide from URL`);
				} else {
					this.showStatus(`Ready to generate list for commander from URL`);
				}
			}
			return;
		}

		if (query.length < 2) {
			this.hideSearchResults();
			return;
		}

		try {
			const scryfall = new ScryfallAPI();
			const results = await scryfall.searchCards(query);

			this.displaySearchResults(results);
			
		} catch (error) {
			this.hideSearchResults();
		}
	}

    displaySearchResults(results) {
        if (!this.searchResults) {
            return;
        }

        if (results.length === 0) {
            this.searchResults.innerHTML = '<div class="search-result">No results found</div>';
            this.searchResults.classList.add('active');
            return;
        }

        this.searchResults.innerHTML = '';
        results.slice(0, 10).forEach(card => {
            const resultElement = document.createElement('div');
            resultElement.className = 'search-result';
            resultElement.innerHTML = `
                <div class="card-name">${this.escapeHTML(card.name)}</div>
                <div class="card-type">${this.escapeHTML(card.type_line)}</div>
            `;
            
            resultElement.addEventListener('click', () => {
                this.selectCommander(card);
            });
            
            this.searchResults.appendChild(resultElement);
        });

        this.searchResults.classList.add('active');
    }

    hideSearchResults() {
        if (this.searchResults) {
            this.searchResults.classList.remove('active');
        }
    }

	selectCommander(card) {
		this.currentCommander = card;
		this.commanderState.setFromSelection(card); // NEW
		this.cardSearch.value = card.name;
		this.hideSearchResults();
		
		if (this.generateBtn) {
			this.generateBtn.disabled = false;
		}
		
		this.showStatus(`Selected: ${card.name}`);
	}

	async generateList() {
		let commanderToUse = this.currentCommander;
		let searchInput = this.cardSearch.value.trim();
		
		// === IMPROVED: DETECT CONTENT TYPE WITH STATE RESET ===
		this.contentType = this.determineContentType(searchInput);
		console.log(`🎯 Starting generation for content type: ${this.contentType}`);
		
		// RESET STATE BEFORE PROCESSING - CRITICAL FIX
		this.resetStateForContentType(this.contentType);
		
		// Handle upgrade guide URLs first
		if (this.contentType === 'upgrade-guide') {
			await this.handleUpgradeGuide(searchInput);
			return;
		}
		
		// Handle URL input if no commander selected but URL detected
		if (!commanderToUse && searchInput) {
			const urlCommander = this.extractCommanderFromURL(searchInput);
			if (urlCommander) {
				console.log(`🎯 Using commander from URL: ${urlCommander}`);
				try {
					const scryfall = new ScryfallAPI();
					commanderToUse = await scryfall.getCardByName(urlCommander);
					if (commanderToUse) {
						this.currentCommander = commanderToUse;
						this.cardSearch.value = commanderToUse.name; // Update display
						this.hideSearchResults();
						this.showStatus(`Selected: ${commanderToUse.name} (from URL)`);
					}
				} catch (error) {
					this.showError(`Failed to find commander from URL: ${error.message}`);
					return;
				}
			}
		}
		
		// ============================================
		// BRANCH: EDHREC URL vs MANUAL SELECTION
		// ============================================
		
		if (this.contentType === 'edhrec-url') {
			// ============================================
			// EDHREC URL PROCESSING (SINGLE OR PARTNER)
			// ============================================
			this.showLoading();
			this.hideError();
			this.hideStatus();

			try {
				// Pass URL directly to extractEDHRECData
				this.cardData = await window.extractEDHRECData(searchInput);

				if (!this.cardData || Object.keys(this.cardData).length === 0) {
					throw new Error('No card data found from EDHREC URL');
				}
				
				// Add commander card(s) - handles both single and partner
				await this.addCommanderCard();
				
				// Update display name in search box
				if (this.commanderState.getDisplayName()) {
					this.cardSearch.value = this.commanderState.getDisplayName();
				}
				
				await this.displayCards(this.cardData);
				this.hideLoading();
				
				const totalCards = this.countTotalCards();
				const displayName = this.commanderState.getDisplayName() || 'commander';
				
				this.showStatus(`Successfully generated list for ${displayName} with ${totalCards} cards`);
				
			} catch (error) {
				this.hideLoading();
				this.showError(`Failed to generate list: ${error.message}`);
			}
			
		} else {
			// ============================================
			// ORIGINAL SINGLE COMMANDER PROCESSING
			// ============================================
			
			// VALIDATION 
			if (!commanderToUse) {
				this.showError('Please select a commander first or enter a valid EDHREC URL');
				return;
			}

			// IMPLEMENTATION
			this.showLoading();
			this.hideError();
			this.hideStatus();

			try {
				this.cardData = await window.extractEDHRECData(commanderToUse.name);

				if (!this.cardData || Object.keys(this.cardData).length === 0) {
					throw new Error('No card data found for this commander');
				}
				
				await this.addCommanderCard();
				
				await this.displayCards(this.cardData);
				this.hideLoading();
				
				const totalCards = this.countTotalCards();
				this.showStatus(`Successfully generated list for ${commanderToUse.name} with ${totalCards} cards`);
				
			} catch (error) {
				this.hideLoading();
				this.showError(`Failed to generate list: ${error.message}`);
			}
		}
	}
	
	async addCommanderCard() {
		if (!this.cardData) {
			return;
		}
		
		// Get deck count if available
		const deckCount = this.cardData._deckCount || 'Commander';
		if (this.cardData._deckCount) {
			delete this.cardData._deckCount;
		}
		
		// If we have commander data from EDHREC page, use it
		if (this.cardData._commanderData) {
			const commanderData = this.cardData._commanderData;
			this.commanderState.setFromEDHRECPage(this.cardData, this.cardSearch.value.trim());
			
			try {
				// Fetch commander data from Scryfall
				await this.commanderState.fetchScryfallData();
				
				// Get commander section for display
				const commanderSection = this.commanderState.getCommanderSectionData();
				
				// Merge with card data
				this.cardData = { ...commanderSection, ...this.cardData };
				
				// Update currentCommander for backward compatibility
				this.currentCommander = this.commanderState.getCurrentCommander();
				
			} catch (error) {
				console.error('Failed to add commander card:', error);
				// Continue without commander section
			}
			
			// Clean up
			delete this.cardData._commanderData;
			return;
		}
		
		// Fallback: Original logic for manual selection
		if (this.currentCommander) {
			const scryfallAPI = new ScryfallAPI();
			let commanderPrice = 'Price N/A';
			
			try {
				commanderPrice = await scryfallAPI.getPriceDisplay(this.currentCommander.prices, true);
			} catch (error) {
				console.error('Error getting commander price:', error);
			}
			
			const commanderSection = {
				"Commander": [{
					name: this.currentCommander.name,
					inclusion: deckCount,
					mana_cost: this.currentCommander.mana_cost,
					type_line: this.currentCommander.type_line,
					oracle_text: this.currentCommander.oracle_text,
					flavor_text: this.currentCommander.flavor_text,
					power: this.currentCommander.power,
					toughness: this.currentCommander.toughness,
					loyalty: this.currentCommander.loyalty,
					defense: this.currentCommander.defense,
					price: commanderPrice
				}]
			};
			
			this.cardData = { ...commanderSection, ...this.cardData };
		}
	}
		
    countTotalCards() {
        if (!this.cardData) return 0;
        const total = Object.values(this.cardData).reduce((sum, section) => sum + section.length, 0);
        return total;
    }

	async displayCards(cardData) {
		if (!this.cardGrid) {
			return;
		}

		this.cardGrid.innerHTML = '';
		
		if (!cardData || Object.keys(cardData).length === 0) {
			this.cardGrid.innerHTML = '<p class="text-center">No card data found</p>';
			return;
		}

		try {
			if (!this.displayEngine) {
				this.displayEngine = new CardDisplayEngine();
			}
			
			// ENHANCED: Ensure proper grid layout for commander lists
			if (this.contentType === 'commander-list' || this.contentType === 'custom-list') {
				this.updateGridColumns(); // Apply grid classes for commander lists
			} else {
				this.resetCardGridLayout(); // Use base layout for other content types
			}
			
			// CRITICAL FIX: AWAIT SYMBOL DATABASE READINESS BEFORE RENDERING
			await this.displayEngine.ensureSymbolSupport();

			for (const [sectionName, sectionCards] of Object.entries(cardData)) {
				if (sectionCards.length > 0) {
					const sectionHeader = document.createElement('div');
					sectionHeader.className = 'section-header';
					
					if (sectionName === "Commander") {
						sectionHeader.textContent = `${sectionName}`;
					} else {
						sectionHeader.textContent = `${sectionName} (${sectionCards.length} cards)`;
					}
					
					this.cardGrid.appendChild(sectionHeader);

					const cardFrames = await this.displayEngine.createCardFrames(sectionCards, this.fontSize);
					cardFrames.forEach((frame, index) => {
						this.cardGrid.appendChild(frame);
					});
				}
			}
			
		} catch (error) {
			this.cardGrid.innerHTML = '<p class="text-center">Error displaying cards</p>';
		}
	}

    updateGridColumns() {
		if (!this.cardGrid) return;
		
		const sizeToColumns = {
			'xs': 'columns-6',
			'sm': 'columns-5', 
			'md': 'columns-4',
			'lg': 'columns-3',
			'xl': 'columns-3'
		};
		
		this.cardGrid.className = 'card-grid';
		this.cardGrid.classList.add(sizeToColumns[this.fontSize]);
	}

    downloadText() {
        if (!this.cardData || Object.keys(this.cardData).length === 0) {
            this.showError('No card data available to download');
            return;
        }

        try {
            const exportManager = new ExportManager();
            const commanderName = this.currentCommander ? 
                this.currentCommander.name.replace(/[^a-z0-9]/gi, '_') : 'edhrec';
            const filename = `${commanderName}_list.txt`;
            
            exportManager.downloadTextFile(this.cardData, filename);
            
            this.showStatus('Text file downloaded');
            
        } catch (error) {
            this.showError('Failed to download text file: ' + error.message);
        }
    }

	async generatePdf() {
		console.log(`📄 PDF Generation requested for content type: ${this.contentType}`);
		
		// VALIDATION: Ensure we have content
		const cardGrid = document.getElementById('cardGrid');
		if (!cardGrid || cardGrid.children.length === 0) {
			this.showError('No content available to generate PDF');
			return;
		}
		
		// For EDHREC URLs, ensure commander state is ready
		if (this.contentType === 'edhrec-url' && !this.commanderState.isReady()) {
			this.showError('Commander data not fully loaded yet');
			return;
		}

		try {
			const exportManager = new ExportManager();
			const filename = this.getPDFFilename();
			
			// Route based on content type
			switch(this.contentType) {
				case 'upgrade-guide':
					await exportManager.generateUpgradeGuidePDF(filename);
					break;
					
				case 'partner-commander-list':
				case 'commander-list':
				case 'edhrec-url':
					// All use the same PDF generation
					await exportManager.generatePdf(this.cardData, filename);
					break;
					
				case 'custom-list':
					await exportManager.generatePdf(this.cardData, filename);
					break;
					
				default:
					throw new Error(`Unsupported content type for PDF: ${this.contentType}`);
			}
			
			this.showStatus('PDF generated and opened in new tab');
			
		} catch (error) {
			console.error('❌ PDF generation failed:', error);
			this.showError('Failed to generate PDF: ' + error.message);
		}
	}

	// === PDF FILENAME GENERATION ===
	getPDFFilename() {
		let baseName = 'edhrec';
		
		// Use commanderState for consistent naming
		if (this.commanderState.type === 'partner') {
			baseName = this.commanderState.scryfallData
				.map(cmd => cmd.name.replace(/[^a-z0-9]/gi, '_'))
				.join('_and_');
		} else if (this.commanderState.type === 'single' && this.commanderState.scryfallData.length > 0) {
			baseName = this.commanderState.scryfallData[0].name.replace(/[^a-z0-9]/gi, '_');
		} else if (this.commanderState.type === 'custom') {
			baseName = 'custom_list'; // File uploads
		}
		// Fallback to currentCommander for backward compatibility
		else if (this.currentCommander) {
			baseName = this.currentCommander.name.replace(/[^a-z0-9]/gi, '_');
		}
		
		switch(this.contentType) {
			case 'upgrade-guide':
				return `${baseName}_upgrade_guide.pdf`;
			case 'edhrec-url':
			case 'commander-list':
				return `${baseName}_commander_list.pdf`;
			case 'custom-list':
				return `${baseName}_custom_list.pdf`;
			default:
				return `${baseName}_document.pdf`;
		}
	}


    loadList() {
        if (!this.fileInput) {
            this.showError('Load functionality not available');
            return;
        }

        try {
            this.fileInput.click();
        } catch (error) {
            this.showError('Cannot open file selector');
        }
    }

    printList() {
        if (!this.cardData || Object.keys(this.cardData).length === 0) {
            this.showError('No card data available to print');
            return;
        }

        try {
            window.print();
        } catch (error) {
            this.showError('Print functionality not available');
        }
    }

    decreaseFontSize() {
        const sizes = ['xs', 'sm', 'md', 'lg', 'xl'];
        const currentIndex = sizes.indexOf(this.fontSize);
        if (currentIndex > 0) {
            this.fontSize = sizes[currentIndex - 1];
            this.updateFontSizeDisplay();
            this.displayCards(this.cardData);
        }
    }

    increaseFontSize() {
        const sizes = ['xs', 'sm', 'md', 'lg', 'xl'];
        const currentIndex = sizes.indexOf(this.fontSize);
        if (currentIndex < sizes.length - 1) {
            this.fontSize = sizes[currentIndex + 1];
            this.updateFontSizeDisplay();
            this.displayCards(this.cardData);
        }
    }

    updateFontSizeDisplay() {
        if (this.sizeDisplay) {
            const sizeLabels = {
                'xs': 'Extra Small',
                'sm': 'Small', 
                'md': 'Medium',
                'lg': 'Large',
                'xl': 'Extra Large'
            };
            this.sizeDisplay.textContent = sizeLabels[this.fontSize];
        }
    }

    handleFileSelect(event) {
        const file = event.target.files[0];
        if (!file) {
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const content = e.target.result;
				
				// === SET CONTENT TYPE FOR FILE UPLOADS ===
				this.contentType = this.determineContentType(null, content);
				console.log(`📁 Processing file upload as: ${this.contentType}`);
				
                this.parseUploadedFile(content, file.name);
                
            } catch (error) {
                this.showError('Error processing file: ' + error.message);
            }
        };

        reader.onerror = (error) => {
            this.showError('Cannot read selected file');
        };

        reader.readAsText(file);
    }

	parseUploadedFile(content, fileName) {
		try {
			const exportManager = new ExportManager();
			const cardData = exportManager.parseCardList(content);
			
			const validation = exportManager.validateCardList(cardData);
			
			if (!validation.isValid) {
				this.showError('Invalid file format: ' + validation.errors.join(', '));
				return;
			}
			
			if (validation.warnings.length > 0) {
				this.showStatus(`File loaded with warnings: ${validation.warnings.join(', ')}`);
			}
			
			this.cardData = cardData;
			this.currentCommander = null;
			this.commanderState.setFromFile(); // NEW
			
			this.displayCards(this.cardData);
			this.showStatus(`Loaded custom list with ${this.countTotalCards()} cards`);
			
		} catch (error) {
			this.showError('Cannot parse file: ' + error.message);
		}
	}

    showLoading() {
        if (this.loadingSpinner) {
            this.loadingSpinner.classList.remove('hidden');
        }
    }

    hideLoading() {
        if (this.loadingSpinner) {
            this.loadingSpinner.classList.add('hidden');
        }
    }

    showError(message) {
        if (this.errorMessage) {
            this.errorMessage.textContent = message;
            this.errorMessage.classList.remove('hidden');
        }
    }

    hideError() {
        if (this.errorMessage) {
            this.errorMessage.classList.add('hidden');
        }
    }

    showStatus(message) {
        if (this.statusMessage) {
            this.statusMessage.textContent = message;
            this.statusMessage.classList.remove('hidden');
        }
    }

    hideStatus() {
        if (this.statusMessage) {
            this.statusMessage.classList.add('hidden');
        }
    }

    escapeHTML(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
	
	extractCommanderFromURL(url) {
		// Skip if it's an upgrade guide URL
		if (this.isUpgradeGuideURL(url)) {
			return null;
		}
		
		try {
			console.log(`🔗 URL detected: ${url}`);
			
			// Parse EDHREC commander URLs
			const urlObj = new URL(url);
			const pathParts = urlObj.pathname.split('/');
			
			// Extract from patterns like:
			// /commanders/etali-primal-conqueror
			// /commanders/clavileno-first-of-the-blessed
			if (urlObj.hostname.includes('edhrec.com') && pathParts.includes('commanders')) {
				const commanderSlug = pathParts[pathParts.length - 1];
				if (commanderSlug && commanderSlug !== 'commanders') {
					// Convert slug to proper name: "etali-primal-conqueror" → "Etali, Primal Conqueror"
					const nameParts = commanderSlug.split('-').map(part => 
						part.charAt(0).toUpperCase() + part.slice(1)
					);
					const commanderName = nameParts.join(' ').replace(/ And /g, ' and ');
					console.log(`✅ Extracted commander: ${commanderName}`);
					return commanderName;
				}
			}
		} catch (error) {
			console.log('❌ Not a valid EDHREC URL, using as regular search');
		}
		return null;
	}
	
	setupSearchDropdown() {
		this.handleDocumentClick = (event) => {
			const searchContainer = document.querySelector('.search-container');
			const dropdown = this.searchResults;
			
			if (searchContainer && dropdown && 
				!searchContainer.contains(event.target) && 
				dropdown.classList.contains('active')) {
				this.hideSearchResults();
			}
		};

		this.handleSearchKeydown = (event) => {
			if (!this.searchResults.classList.contains('active')) return;

			const results = this.searchResults.querySelectorAll('.search-result');
			if (results.length === 0) return;

			// Handle only arrow keys and Escape here
			// Enter and Tab are handled by our unified handler below
			switch(event.key) {
				case 'ArrowDown':
					event.preventDefault();
					this.navigateSearchResults(1);
					break;
				case 'ArrowUp':
					event.preventDefault();
					this.navigateSearchResults(-1);
					break;
				case 'Escape':
					event.preventDefault();
					this.hideSearchResults();
					break;
				// Explicitly ignore Enter and Tab to avoid conflicts
				case 'Enter':
				case 'Tab':
					// These are handled by the unified handler
					break;
			}
		};

		// Unified key handler for Enter and Tab keys
		this.unifiedKeyHandler = (event) => {
			const query = this.cardSearch.value.trim();
			
			// Handle Enter key
			if (event.key === 'Enter') {
				// Case 1: URL input - generate immediately
				if (query.startsWith('http') || query.includes('edhrec.com')) {
					const urlCommander = this.extractCommanderFromURL(query);
					if (urlCommander) {
						event.preventDefault();
						this.generateList();
						return;
					}
				}
				
				// Case 2: Card selection from dropdown - select highlighted result
				if (this.searchResults.classList.contains('active')) {
					event.preventDefault();
					this.selectHighlightedResult();
					return;
				}
				
				// Case 3: Regular search with no dropdown - try to generate if button enabled
				if (!this.generateBtn.disabled) {
					event.preventDefault();
					this.generateList();
				}
			}
			
			// Handle Tab key for card selection and dropdown dismissal
			if (event.key === 'Tab') {
				// Case 1: If dropdown is active, select highlighted result and hide dropdown
				if (this.searchResults.classList.contains('active')) {
					event.preventDefault(); // Prevent default tab behavior temporarily
					this.selectHighlightedResult();
					this.hideSearchResults();
					
					// After selection, allow natural tab progression to next element
					// We'll use a small timeout to let the DOM update first
					setTimeout(() => {
						// Find all focusable elements
						const focusableElements = Array.from(document.querySelectorAll(
							'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
						)).filter(el => !el.disabled && el.offsetParent !== null);
						
						const currentIndex = focusableElements.indexOf(this.cardSearch);
						const nextIndex = currentIndex + 1;
						
						if (nextIndex < focusableElements.length) {
							focusableElements[nextIndex].focus();
						}
					}, 10);
					return;
				}
				
				// Case 2: If no dropdown active, allow normal tab behavior (default)
				// No action needed - let the browser handle normal tab navigation
			}
		};

	// HandleSearchBlur method
	this.handleSearchBlur = () => {
		const query = this.cardSearch.value.trim();
		if (query.startsWith('http') || query.includes('edhrec.com')) {
			const urlCommander = this.extractCommanderFromURL(query);
			const isUpgradeGuide = this.isUpgradeGuideURL(query);
			
			if ((urlCommander || isUpgradeGuide) && this.generateBtn) {
				this.generateBtn.disabled = false;
				if (isUpgradeGuide) {
					this.showStatus(`Ready to generate upgrade guide from URL`);
				} else {
					this.showStatus(`Ready to generate list for commander from URL`);
				}
			}
		}
	};

		// Set up all event listeners
		document.addEventListener('click', this.handleDocumentClick);
		
		if (this.cardSearch) {
			// For arrow keys and Escape only
			this.cardSearch.addEventListener('keydown', this.handleSearchKeydown);
			// For Enter and Tab keys (unified handler)
			this.cardSearch.addEventListener('keydown', this.unifiedKeyHandler);
			// For URL detection on blur
			this.cardSearch.addEventListener('blur', this.handleSearchBlur);
		}
	}

	navigateSearchResults(direction) {
		const results = this.searchResults.querySelectorAll('.search-result');
		if (results.length === 0) return;

		let currentIndex = -1;
		
		results.forEach((result, index) => {
			if (result.classList.contains('selected')) {
				currentIndex = index;
				result.classList.remove('selected');
			}
		});

		let newIndex = currentIndex + direction;
		if (newIndex < 0) newIndex = results.length - 1;
		if (newIndex >= results.length) newIndex = 0;

		results[newIndex].classList.add('selected');
		results[newIndex].scrollIntoView({ block: 'nearest' });
	}

	selectHighlightedResult() {
		const selectedResult = this.searchResults.querySelector('.search-result.selected');
		if (selectedResult) {
			selectedResult.click();
		} else {
			const firstResult = this.searchResults.querySelector('.search-result');
			if (firstResult) {
				firstResult.click();
			}
		}
	}
	
	checkSymbolCacheVersion() {
		const currentVersion = window.symbolDatabase?.database?.version;
		const lastVersion = localStorage.getItem('symbolCacheVersion');
		
		if (currentVersion && currentVersion !== lastVersion) {
			console.log(`🔄 Symbol format changed (${lastVersion} → ${currentVersion}), clearing caches`);
			
			// Clear CardDisplayEngine cache
			if (this.displayEngine?.cardCache) {
				this.displayEngine.cardCache.clear();
			}
			
			// Update version tracking
			localStorage.setItem('symbolCacheVersion', currentVersion);
			return true; // Cache was cleared
		}
		
		return false; // No change
	}
	
    /**
     * ENHANCED URL DETECTION: Check if input is an upgrade guide URL
     * Why: Route to appropriate extraction method based on URL type
     * @param {string} url - User input to check
     * @returns {boolean} True if URL is an EDHREC upgrade guide
     */
    isUpgradeGuideURL(url) {
        if (!url || typeof url !== 'string') return false;
        
        const upgradeGuidePatterns = [
            /edhrec\.com\/articles\/.*upgrade.*guide/i,
            /edhrec\.com\/articles\/.*upgrade/i,
            /edhrec\.com\/articles\/.*guide/i
        ];
        
        return upgradeGuidePatterns.some(pattern => pattern.test(url));
    }

    /**
     * UPGRADE GUIDE HANDLER: Process upgrade guide URLs
     * Flow: Detect → Extract → Display
     * @param {string} url - EDHREC upgrade guide URL
     */
    async handleUpgradeGuide(url) {
        console.log('🎯 Handling upgrade guide URL:', url);
        
        this.showLoading();
        this.hideError();
        this.hideStatus();

        try {
            // STEP 1: Extract guide content using our new system
            const guideData = await window.extractEDHRECUpgradeGuide(url);
            
            // STEP 2: Validate we got meaningful content
            if (!guideData || !guideData.contentBlocks || guideData.contentBlocks.length === 0) {
                throw new Error('No upgrade guide content could be extracted');
            }

            // STEP 3: Display the guide using our new display engine
            await this.displayUpgradeGuide(guideData);
            this.hideLoading();
            
            this.showStatus(`Successfully loaded upgrade guide: ${guideData.title}`);
            
        } catch (error) {
            this.hideLoading();
            this.showError(`Failed to load upgrade guide: ${error.message}`);
            console.error('Upgrade guide handling error:', error);
        }
    }

	/**
	 * UPGRADE GUIDE DISPLAY: Render guide in main content area
	 * Enhanced with proper layout reset to prevent commander list pollution
	 * @param {Object} guideData - Structured guide data from extractor
	 */
	async displayUpgradeGuide(guideData) {
		if (!this.cardGrid) {
			throw new Error('No card grid container available');
		}
		
		try {
			// ENHANCED: Reset card grid for upgrade guide layout
			this.cardGrid.innerHTML = '';
			this.resetCardGridLayout(); // Ensure no grid classes from commander lists
			
			console.log('🎨 Starting upgrade guide display with clean layout');
			
			// Create and use upgrade guide display engine
			const guideDisplay = new UpgradeGuideDisplayEngine();
			await guideDisplay.displayUpgradeGuide(guideData, this.cardGrid);
			
			console.log('✅ Upgrade guide display completed successfully');
			
		} catch (error) {
			console.error('❌ Upgrade guide display error:', error);
			this.cardGrid.innerHTML = `
				<div class="error-message">
					<h3>Error Displaying Upgrade Guide</h3>
					<p>${error.message}</p>
				</div>
			`;
			throw error;
		}
	}
	
	determineContentType(input, fileContent = null) {
		console.log('🔍 Content type detection for:', { 
			input: input?.substring(0, 100), 
			hasFile: !!fileContent
		});
		
		// PRIORITY 1: FILE UPLOADS - Highest priority
		if (fileContent) {
			console.log('✅ Content type: custom-list (file upload)');
			return 'custom-list';
		}
		
		// PRIORITY 2: URL-BASED CONTENT DETECTION
		if (typeof input === 'string' && input.trim()) {
			const trimmedInput = input.trim();
			
			// Check for upgrade guide URLs first
			if (this.isUpgradeGuideURL(trimmedInput)) {
				console.log('✅ Content type: upgrade-guide (URL detection)');
				return 'upgrade-guide';
			}
			
			// Check for EDHREC URLs
			if (trimmedInput.startsWith('http') || trimmedInput.includes('edhrec.com')) {
				// We'll determine single vs partner after fetching
				console.log('✅ Content type: edhrec-url (needs fetch to determine)');
				return 'edhrec-url';
			}
		}
		
		// PRIORITY 3: CURRENT COMMANDER SELECTION
		if (this.currentCommander) {
			console.log('✅ Content type: commander-list (current selection)');
			return 'commander-list';
		}
		
		// PRIORITY 4: FALLBACK
		console.log('⚠️ Content type: unknown');
		return 'unknown';
	}
	
	resetStateForContentType(newContentType) {
		console.log('🔄 Resetting state for content type:', newContentType);
		
		// Always reset commander state
		this.commanderState.reset();
		
		switch(newContentType) {
			case 'upgrade-guide':
				this.currentCommander = null;
				this.cardData = null;
				console.log('✅ Reset commander state for upgrade guide');
				break;
				
			case 'edhrec-url':
				// Reset card data but keep commander state will be set after fetch
				this.cardData = null;
				this.currentCommander = null;
				console.log('✅ Reset state for EDHREC URL');
				break;
				
			case 'commander-list':
				// Keep currentCommander if set, but reset card data
				this.cardData = null;
				console.log('✅ Reset card data for commander list');
				break;
				
			case 'custom-list':
				this.currentCommander = null;
				this.cardData = null;
				console.log('✅ Reset all state for custom list');
				break;
				
			default:
				this.currentCommander = null;
				this.cardData = null;
				console.log('✅ Reset all state for unknown type');
		}
		
		// Clear display engine cache
		if (this.displayEngine && this.displayEngine.cardCache) {
			const cacheSize = this.displayEngine.cardCache.size;
			this.displayEngine.cardCache.clear();
			console.log(`✅ Cleared display engine cache (${cacheSize} items)`);
		}
		
		// Reset card grid CSS classes
		this.resetCardGridLayout();
	}
	
	resetCardGridLayout() {
		if (!this.cardGrid) return;
		
		// Remove all column classes and reset to base
		this.cardGrid.className = 'card-grid';
		console.log('✅ Reset card grid CSS classes to base');
		
		// Re-apply font size class if needed
		if (this.fontSize) {
			this.cardGrid.classList.add(`font-size-${this.fontSize}`);
		}
	}
}

document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM fully loaded and parsed');
    
    try {
        window.app = new App();
        
    } catch (error) {
        console.error('CRITICAL: App initialization failed:', error);
    }
});

window.addEventListener('error', function(event) {
    console.error('Global error caught:', event.error);
});

window.addEventListener('unhandledrejection', function(event) {
    console.error('Unhandled promise rejection:', event.reason);
});


// Main Application Class with Comprehensive Debugging
class App {
    constructor() {
        
        this.currentCommander = null;
        this.cardData = null;
        this.fontSize = 'md';
        this.displayEngine = null;
		this.contentType = null;
        
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
	
	async addCommanderCard() {
		if (!this.currentCommander) {
			return;
		}
		
		// Get deck count from EDHREC data or use fallback
		let deckCount = 'Commander';
		if (this.cardData && this.cardData._deckCount) {
			deckCount = this.cardData._deckCount;
			delete this.cardData._deckCount;
		}
		
		let commanderPrice = 'Price N/A';
		try {
			const scryfallAPI = new ScryfallAPI();
			commanderPrice = await scryfallAPI.getPriceDisplay(this.currentCommander.prices, true);
		} catch (error) {
			console.error('Error getting commander price:', error);
		}
		
		const commanderSection = {
			"Commander": [{
				name: this.currentCommander.name,
				inclusion: deckCount, // This will now be "172,434 decks" instead of just "Commander"
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

	/**
	 * Main PDF generation entry point with content type routing
	 * Uses switch/case for clear pathway selection based on content type
	 */
	async generatePdf() {
		console.log(`📄 PDF Generation requested for content type: ${this.contentType}`);
		
		// VALIDATION: Ensure we have a valid content type
		if (!this.contentType || this.contentType === 'unknown') {
			this.showError('Please generate content first before creating PDF');
			return;
		}
		
		// VALIDATION: Ensure DOM content exists
		const cardGrid = document.getElementById('cardGrid');
		if (!cardGrid || cardGrid.children.length === 0) {
			this.showError('No content available to generate PDF');
			return;
		}

		try {
			const exportManager = new ExportManager();
			const filename = this.getPDFFilename();
			
			// === CONTENT TYPE ROUTING ===
			console.log(`🔄 Routing to PDF generator for: ${this.contentType}`);
			
			switch(this.contentType) {
				case 'upgrade-guide':
					// Upgrade guides use DOM-only processing with hybrid layout
					await exportManager.generateUpgradeGuidePDF(filename);
					break;
					
				case 'commander-list':
				case 'custom-list':
					// Commander lists and custom lists use existing data+DOM system
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
	/**
	 * Generates appropriate PDF filename based on content type and commander
	 */
	getPDFFilename() {
		const baseName = this.currentCommander ? 
			this.currentCommander.name.replace(/[^a-z0-9]/gi, '_') : 'edhrec';
		
		switch(this.contentType) {
			case 'upgrade-guide':
				return `${baseName}_upgrade_guide.pdf`;
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
	
	/**
	 * IMPROVED: Content type detection that prevents state pollution
	 * Prioritizes URL input and explicitly resets state between types
	 * @param {string} input - User input (URL or card name)
	 * @param {string} fileContent - File content for uploads
	 * @returns {string} Content type
	 */
	determineContentType(input, fileContent = null) {
		console.log('🔍 IMPROVED Content type detection for:', { 
			input: input?.substring(0, 100), 
			hasFile: !!fileContent,
			currentCommander: this.currentCommander?.name 
		});
		
		// PRIORITY 1: FILE UPLOADS - Highest priority
		if (fileContent) {
			console.log('✅ Content type: custom-list (file upload)');
			return 'custom-list';
		}
		
		// PRIORITY 2: URL-BASED CONTENT DETECTION (explicit input)
		if (typeof input === 'string' && input.trim()) {
			const trimmedInput = input.trim();
			
			// Check for upgrade guide URLs first (most specific)
			if (this.isUpgradeGuideURL(trimmedInput)) {
				console.log('✅ Content type: upgrade-guide (explicit URL detection)');
				return 'upgrade-guide';
			}
			
			// Check for commander URLs second
			const urlCommander = this.extractCommanderFromURL(trimmedInput);
			if (urlCommander) {
				console.log('✅ Content type: commander-list (URL commander detection)');
				return 'commander-list';
			}
		}
		
		// PRIORITY 3: CURRENT COMMANDER (only if input matches current commander)
		// This prevents stale commander state from affecting new requests
		if (this.currentCommander && input === this.currentCommander.name) {
			console.log('✅ Content type: commander-list (current selection matches input)');
			return 'commander-list';
		}
		
		// PRIORITY 4: FALLBACK - Reset to unknown if no clear match
		console.log('⚠️ Content type: unknown (no clear match, resetting)');
		return 'unknown';
	}
	
	/**
	 * Reset application state when switching between content types
	 * Prevents pollution between commander lists and upgrade guides
	 * @param {string} newContentType - The new content type being switched to
	 */
	resetStateForContentType(newContentType) {
		console.log('🔄 Resetting state for content type:', newContentType);
		
		switch(newContentType) {
			case 'upgrade-guide':
				// Reset commander-specific state for upgrade guides
				this.currentCommander = null;
				this.cardData = null;
				console.log('✅ Reset commander state for upgrade guide');
				break;
				
			case 'commander-list':
				// Keep commander state, but ensure cardData is fresh
				this.cardData = null;
				console.log('✅ Reset card data for fresh commander list');
				break;
				
			case 'custom-list':
				// Reset everything for custom lists
				this.currentCommander = null;
				this.cardData = null;
				console.log('✅ Reset all state for custom list');
				break;
		}
		
		// Optional: Clear display engine cache to prevent card pollution
		if (this.displayEngine && this.displayEngine.cardCache) {
			const cacheSize = this.displayEngine.cardCache.size;
			this.displayEngine.cardCache.clear();
			console.log(`✅ Cleared display engine cache (${cacheSize} items)`);
		}
		
		// Reset card grid CSS classes
		this.resetCardGridLayout();
	}
	
	/**
	 * Reset card grid CSS classes for proper layout
	 * Prevents grid classes from commander lists affecting upgrade guides
	 */
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

// Export and Import Functions - CLEAN SINGLE IMPLEMENTATION
class ExportManager {
    constructor() {
        this.pdfjs = window.jspdf;
        this.debug = window.debugSystem || (window.app && window.app.debug);
    }

	async generatePdf(cardData, filename = 'edhrec-list.pdf') {
		console.log('PDF Generation: Starting with content detection');
		
		try {
			// DETECT CONTENT TYPE - Check if we're dealing with upgrade guide
			const cardGrid = document.getElementById('cardGrid');
			if (!cardGrid) throw new Error('Card grid element not found');
			
			const isUpgradeGuide = cardGrid.querySelector('.upgrade-guide-header') !== null ||
								  cardGrid.querySelector('.guide-paragraph-group') !== null ||
								  cardGrid.querySelector('.guide-cardlist') !== null;
			
			console.log(`📊 Content type: ${isUpgradeGuide ? 'Upgrade Guide' : 'Card Grid'}`);
			
			// Get cutoff value from UI (only applies to card grids)
			const cutoffInput = document.getElementById('pdfCutoff');
			const cutoffPercent = cutoffInput ? parseFloat(cutoffInput.value) || 0 : 0;
			
			console.log(`PDF Filter: Cutoff set to ${cutoffPercent}%`);
			
			let restorationData = null;
			
			// APPLY FILTERING ONLY FOR CARD GRIDS (upgrade guides don't have inclusion percentages)
			if (!isUpgradeGuide && cutoffPercent > 0) {
				restorationData = this.filterDOMForPDF(cutoffPercent);
			}

			this.showPDFLoading();
				
			const { jsPDF } = this.pdfjs;
			const pdf = new jsPDF('p', 'mm', 'a4');
			
			// PDF COORDINATE SYSTEM
			const pageWidth = 210;
			const pageHeight = 297;
			const margin = 8;
			
			// BRANCH BASED ON CONTENT TYPE
			if (isUpgradeGuide) {
				await this.generateUpgradeGuidePDF(pdf, pageWidth, pageHeight, margin);
			} else {
				await this.generateCardGridPDF(pdf, pageWidth, pageHeight, margin, cutoffPercent);
			}

			// Download
			pdf.save(filename);
			this.hidePDFLoading();
			
			console.log('PDF Generation: Completed successfully');
			
			// RESTORE DOM if filtering was applied
			if (restorationData) {
				this.restoreDOMAfterPDF(restorationData);
			}
			
			return true;
			
		} catch (error) {
			console.error('PDF Generation: Failed with error:', error);
			this.hidePDFLoading();
			
			// CRITICAL: Always restore DOM on error
			if (restorationData) {
				this.restoreDOMAfterPDF(restorationData);
			}
			
			throw error;
		}
	}

    async addPrintCardToPDF(pdf, cardElement, x, y, width, height) {
        const cardName = cardElement.querySelector('.card-name');
        const name = cardName ? cardName.textContent : 'Unknown';
        const isDoubleBack = cardElement.classList.contains('double-faced-back');
        const backIndicator = cardElement.querySelector('.back-indicator');
        
        try {
            const canvas = await html2canvas(cardElement, {
                scale: 1.5,
                useCORS: true,
                allowTaint: true,
                backgroundColor: '#ffffff',
                onclone: function(clonedDoc, element) {
					
					// STEP 1: Back indicator styling
                    const clonedBackIndicator = element.querySelector('.back-indicator');     
                    if (clonedBackIndicator) {
                        clonedBackIndicator.setAttribute('style', '');
                        clonedBackIndicator.style.cssText = `
                            color: white !important;
                            background-color: #444 !important;
                            border: 2px solid #444 !important;
                            font-weight: bold !important;
                            padding: 4px 8px !important;
                            border-radius: 6px !important;
                            font-size: 0.9em !important;
                            text-align: center !important;
                            display: inline-block !important;
                            margin: 3px 0 3px 0 !important;
                            min-width: 80px !important;
							line-height: 1.2 !important;
                        `;
                    }
                    
                    // STEP 2: Apply general white background (excluding back indicators AND their children)
                    const allElements = clonedDoc.querySelectorAll('*');
                    allElements.forEach(el => {
                        // Skip back indicators AND any elements inside back indicators
                        const isInBackIndicator = el.closest('.back-indicator');
                        if (!el.classList.contains('back-indicator') && !isInBackIndicator) {
                            el.style.color = '#000000';
                            el.style.backgroundColor = '#ffffff';
                            el.style.boxShadow = 'none';
                        }
                    });
                    
                    // STEP 3: Apply card frame styling
                    const cardFrames = clonedDoc.querySelectorAll('.card-frame');
                    cardFrames.forEach(frame => {
                        frame.style.border = '1px solid #888888';
                        frame.style.background = '#ffffff';
                    });
					
					// STEP 4: ADD SYMBOL SCALING COMPENSATION FOR PDF (1.4x)
					const symbolElements = element.querySelectorAll('.set-symbol-stats');
					symbolElements.forEach(symbol => {
						symbol.style.transform = 'scale(1.4)'; // Compensation for physical 0.5x reduction
						symbol.style.transformOrigin = 'center center';
					});					
					
                }
            });

            const imgData = canvas.toDataURL('image/png');
            pdf.addImage(imgData, 'PNG', x, y, width, height);
            
            // MEDIUM GREY border around card
            pdf.setDrawColor(136, 136, 136);
            pdf.setLineWidth(0.3);
            pdf.rect(x, y, width, height, 'D');
            
            return true;
            
        } catch (error) {
            console.error('Card render failed:', error);
            
            // Fallback
            pdf.setFillColor(255, 255, 255);
            pdf.setDrawColor(136, 136, 136);
            pdf.setLineWidth(0.3);
            pdf.rect(x, y, width, height, 'FD');
            
            pdf.setTextColor(0, 0, 0);
            pdf.setFontSize(7);
            const text = name.substring(0, 30);
            pdf.text(text, x + 2, y + 8);
            
            return false;
        }
    }

    groupElementsBySection(gridChildren) {
        const sections = [];
        let currentSection = { header: null, cards: [] };
        
        for (const element of gridChildren) {
            if (element.classList.contains('section-header')) {
                // Save previous section if it has content
                if (currentSection.header || currentSection.cards.length > 0) {
                    sections.push(currentSection);
                }
                // Start new section
                currentSection = { header: element, cards: [] };
            } else {
                // Add card to current section
                currentSection.cards.push(element);
            }
        }
        
        // Don't forget the last section
        if (currentSection.header || currentSection.cards.length > 0) {
            sections.push(currentSection);
        }
        
        return sections;
    }

    addPrintSectionHeader(pdf, sectionText, x, y, width, height) {
        // Black text inside the wire frame
        pdf.setTextColor(0, 0, 0);
        pdf.setFontSize(10);
        pdf.setFont(undefined, 'bold');
        
        const text = sectionText.trim();
        const centerX = x + (width / 2);
        const centerY = y + (height / 2) + 2;
        
        pdf.text(text, centerX, centerY, { align: 'center' });
    }

    downloadTextFile(cardData, filename = 'edhrec-list.txt') {
        try {
            const textContent = this.exportToText(cardData);
            const blob = new Blob([textContent], { type: 'text/plain;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            
            const link = document.createElement('a');
            link.href = url;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            setTimeout(() => URL.revokeObjectURL(url), 100);
            
        } catch (error) {
            console.error('Text download failed:', error);
            alert('Download failed. Please check your browser settings.');
        }
    }

    exportToText(cardData) {
        const lines = [];
        lines.push('EDHREC Card List');
        lines.push(`Generated on: ${new Date().toLocaleDateString()}\n`);
        
        for (const [sectionName, cards] of Object.entries(cardData)) {
            lines.push(`${sectionName} (${cards.length} cards)`);
            lines.push('='.repeat(sectionName.length + 10));
            
            cards.forEach(card => {
                lines.push(`• ${card.name} - ${card.inclusion}`);
            });
            
            lines.push('');
        }
        
        return lines.join('\n');
    }

    showPDFLoading() {
        let loadingOverlay = document.getElementById('pdfLoadingOverlay');
        if (!loadingOverlay) {
            loadingOverlay = document.createElement('div');
            loadingOverlay.id = 'pdfLoadingOverlay';
            loadingOverlay.innerHTML = `
                <div class="pdf-loading-content">
                    <div class="pdf-spinner"></div>
                    <p>Generating PDF...</p>
                </div>
            `;
            document.body.appendChild(loadingOverlay);
            
            const style = document.createElement('style');
            style.textContent = `
                #pdfLoadingOverlay {
                    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                    background: rgba(0, 0, 0, 0.7); display: flex;
                    justify-content: center; align-items: center; z-index: 10000;
                    color: white; font-size: 18px;
                }
                .pdf-loading-content {
                    text-align: center; background: #2c3e50; padding: 30px;
                    border-radius: 10px; box-shadow: 0 4px 20px rgba(0,0,0,0.5);
                }
                .pdf-spinner {
                    border: 4px solid #f3f3f3; border-top: 4px solid #3498db;
                    border-radius: 50%; width: 50px; height: 50px;
                    animation: spin 1s linear infinite; margin: 0 auto 20px;
                }
                @keyframes spin {
                    0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); }
                }
            `;
            document.head.appendChild(style);
        }
        loadingOverlay.style.display = 'flex';
    }

    hidePDFLoading() {
        const loadingOverlay = document.getElementById('pdfLoadingOverlay');
        if (loadingOverlay) loadingOverlay.style.display = 'none';
    }

    parseCardList(textContent) {
        const lines = textContent.split('\n');
        const cards = [];
        let currentSection = 'Imported Cards';
        
        for (const line of lines) {
            const trimmedLine = line.trim();
            if (!trimmedLine || trimmedLine.startsWith('//') || trimmedLine.startsWith('#')) continue;
            
            if (trimmedLine.endsWith(')') && trimmedLine.includes('(')) {
                currentSection = trimmedLine.split('(')[0].trim();
                continue;
            }
            
            let cardName = trimmedLine;
            let inclusion = '';
            
            if (trimmedLine.includes('-')) {
                const parts = trimmedLine.split('-').map(part => part.trim());
                if (parts.length >= 2) {
                    cardName = parts.slice(0, -1).join('-').trim();
                    inclusion = parts[parts.length - 1];
                    if (!inclusion.includes('%')) inclusion = '';
                }
            }
            
            if (/^\d+x\s/.test(cardName)) {
                cardName = cardName.replace(/^\d+x\s/, '');
            }
            
            const bracketMatch = cardName.match(/\[(.*?)\]\s*(.*)/);
            if (bracketMatch) {
                inclusion = bracketMatch[1];
                cardName = bracketMatch[2];
            }
            
            if (cardName) {
                cards.push({ name: cardName, inclusion: inclusion || 'N/A', section: currentSection });
            }
        }
        
        const sections = {};
        cards.forEach(card => {
            if (!sections[card.section]) sections[card.section] = [];
            sections[card.section].push({ name: card.name, inclusion: card.inclusion });
        });
        
        return sections;
    }

    validateCardList(cardData) {
        const errors = [];
        const warnings = [];
        
        if (!cardData || Object.keys(cardData).length === 0) {
            errors.push('No card data found');
        } else {
            let totalCards = 0;
            for (const [section, cards] of Object.entries(cardData)) {
                totalCards += cards.length;
                if (cards.length === 0) warnings.push(`Section "${section}" is empty`);
                cards.forEach((card, index) => {
                    if (!card.name || card.name.trim().length === 0) {
                        errors.push(`Empty card name in ${section} at position ${index + 1}`);
                    }
                    if (card.name && card.name.length > 100) {
                        warnings.push(`Long card name in ${section}: "${card.name.substring(0, 50)}..."`);
                    }
                });
            }
            if (totalCards === 0) errors.push('No valid cards found');
            if (totalCards > 500) warnings.push(`Large list: ${totalCards} cards`);
        }
        
        return { isValid: errors.length === 0, errors, warnings };
    }
	
	// Add this method to the ExportManager class:
	filterCardsByInclusion(cardData, cutoffPercent) {
		const filteredData = {};
		
		for (const [sectionName, cards] of Object.entries(cardData)) {
			// Skip special properties like _deckCount
			if (sectionName.startsWith('_')) {
				filteredData[sectionName] = cards;
				continue;
			}
			
			filteredData[sectionName] = cards.filter(card => {
				// Extract percentage number from inclusion string (e.g., "68%" -> 68)
				const inclusionMatch = card.inclusion?.match(/(\d+(?:\.\d+)?)%/);
				if (!inclusionMatch) return true; // Keep cards without percentage
				
				const inclusionValue = parseFloat(inclusionMatch[1]);
				return inclusionValue >= cutoffPercent;
			});
		}
		
		return filteredData;
	}
	
	/**
	 * Filter DOM elements by inclusion percentage, excluding "New Cards" section
	 * @param {number} cutoffPercent - Minimum inclusion percentage
	 * @returns {Object} - Restoration data for undo
	 */
	filterDOMForPDF(cutoffPercent) {
		const cardGrid = document.getElementById('cardGrid');
		if (!cardGrid) return null;

		const restorationData = {
			hiddenElements: []
		};

		const sections = this.groupElementsBySection(Array.from(cardGrid.children));
		
		sections.forEach(section => {
			const sectionName = section.header?.textContent?.trim() || '';
			
			// ALWAYS show sections containing "Commander" or "New" (for New Cards)
			const isExempt = sectionName.toLowerCase().includes('commander') || 
							 sectionName.toLowerCase().includes('new');
			
			if (isExempt) {
				return; // Skip filtering for this section
			}

			// Filter cards in other sections
			section.cards.forEach(cardElement => {
				const inclusionValue = this.getCardInclusionValue(cardElement);
				
				if (inclusionValue < cutoffPercent) {
					restorationData.hiddenElements.push({
						element: cardElement,
						originalDisplay: cardElement.style.display
					});
					cardElement.style.display = 'none';
				}
			});
		});

		return restorationData;
	}

	/**
	 * Extract inclusion percentage from card DOM element
	 * @param {Element} cardElement - Card frame element
	 * @returns {number} - Inclusion percentage or 0 if not found
	 */
	getCardInclusionValue(cardElement) {
		const inclusionElement = cardElement.querySelector('.inclusion-percentage');
		if (!inclusionElement) return 0;
		
		const text = inclusionElement.textContent.trim();
		const match = text.match(/(\d+(?:\.\d+)?)%/);
		
		return match ? parseFloat(match[1]) : 0;
	}

	/**
	 * Restore DOM to original state after PDF generation
	 * @param {Object} restorationData - Data from filterDOMForPDF
	 */
	restoreDOMAfterPDF(restorationData) {
		if (!restorationData) return;
		
		restorationData.hiddenElements.forEach(item => {
			if (item.element && item.element.style) {
				item.element.style.display = item.originalDisplay || '';
			}
		});
	}	

	/**
	 * Enhanced card grid PDF generation (existing logic with minor improvements)
	 * Handles traditional card displays with inclusion percentages
	 */
	async generateCardGridPDF(pdf, pageWidth, pageHeight, margin, cutoffPercent) {
		console.log('🃏 Generating Card Grid PDF');
		
		// CARD GRID LAYOUT CONSTANTS
		const cardsPerRow = 4;
		const cardsPerColumn = 6;
		const sectionHeaderHeight = 8;

		const availableWidth = pageWidth - (2 * margin);
		const availableHeight = pageHeight - (2 * margin);
		
		const cardWidth = availableWidth / cardsPerRow;
		const cardHeight = availableHeight / cardsPerColumn;

		const cardGrid = document.getElementById('cardGrid');
		if (!cardGrid) throw new Error('Card grid element not found');

		// Group elements into sections (headers + cards)
		const gridChildren = Array.from(cardGrid.children);
		const sections = this.groupElementsBySection(gridChildren);

		console.log(`PDF Layout: Processing ${sections.length} card sections`);

		let currentPage = 1;
		let currentY = margin;
		let currentCol = 0;
		const MAX_PAGES = 100;

		// PROCESS EACH SECTION
		for (const section of sections) {
			if (currentPage > MAX_PAGES) break;
			
			const { header, cards } = section;
			
			// Filter out hidden cards (from cutoff filtering)
			const visibleCards = cards.filter(card => card.style.display !== 'none');
			if (visibleCards.length === 0) continue;
			
			// CHECK IF SECTION HEADER FITS ON CURRENT PAGE
			const spaceNeeded = (header ? sectionHeaderHeight : 0) + cardHeight;
			if (currentY + spaceNeeded > (pageHeight - margin)) {
				pdf.addPage();
				currentPage++;
				currentY = margin;
				currentCol = 0;
				if (currentPage > MAX_PAGES) break;
			}
			
			// PLACE SECTION HEADER
			if (header) {
				this.addPrintSectionHeader(pdf, header.textContent, margin, currentY, availableWidth, sectionHeaderHeight);
				currentY += sectionHeaderHeight;
				currentCol = 0;
			}
			
			// PLACE SECTION CARDS
			for (let i = 0; i < visibleCards.length; i++) {
				if (currentPage > MAX_PAGES) break;
				
				const card = visibleCards[i];
				
				// Check if we need new row
				if (currentCol >= cardsPerRow) {
					currentCol = 0;
					currentY += cardHeight;
				}
				
				// Check if card fits on current page
				if (currentY + cardHeight > (pageHeight - margin)) {
					pdf.addPage();
					currentPage++;
					currentY = margin;
					currentCol = 0;
					if (currentPage > MAX_PAGES) break;
				}
				
				const cardX = margin + (currentCol * cardWidth);
				
				// Use existing card rendering logic
				await this.addPrintCardToPDF(pdf, card, cardX, currentY, cardWidth, cardHeight);
				
				currentCol++;
			}
			
			// MOVE TO NEXT ROW AFTER SECTION COMPLETION
			if (currentCol !== 0 && currentPage <= MAX_PAGES) {
				currentY += cardHeight;
				currentCol = 0;
				
				// Check if we need new page after section
				if (currentY > (pageHeight - margin) && currentPage <= MAX_PAGES) {
					pdf.addPage();
					currentPage++;
					currentY = margin;
					currentCol = 0;
					if (currentPage > MAX_PAGES) break;
				}
			}
		}

		// ADD PAGE NUMBERS TO FINAL DOCUMENT
		this.addPageNumbersToPDF(pdf, pageWidth, pageHeight);
	}

	/**
	 * Add consistent page numbering to all pages in PDF
	 */
	addPageNumbersToPDF(pdf, pageWidth, pageHeight) {
		const totalPages = pdf.internal.getNumberOfPages();
		
		for (let i = 1; i <= totalPages; i++) {
			pdf.setPage(i);
			pdf.setFontSize(8);
			pdf.setTextColor(100, 100, 100);
			pdf.text(`Page ${i} of ${totalPages}`, pageWidth - 25, pageHeight - 5);
		}
	}
	

	/**
	 * SIMPLE Upgrade Guide PDF - 100% Working Version
	 */
	async generateUpgradeGuidePDF(filename = 'upgrade_guide.pdf') {
		console.log('📄 Starting SIMPLE Upgrade Guide PDF');
		
		const cardGrid = document.getElementById('cardGrid');
		if (!cardGrid) throw new Error('No content available');

		this.showPDFLoading();
		
		try {
			const { jsPDF } = this.pdfjs;
			const pdf = new jsPDF('p', 'mm', 'a4');
			
			const pageWidth = 210;
			const pageHeight = 297; 
			const margin = 15;
			const availableWidth = pageWidth - (2 * margin);
			
			let currentY = margin;
			let currentPage = 1;
			const MAX_PAGES = 20;
			
			// SIMPLE HEADER - Title left, date right
			const header = cardGrid.querySelector('.upgrade-guide-header');
			if (header) {
				const title = header.querySelector('.guide-title')?.textContent || 'Upgrade Guide';
				const date = header.querySelector('.guide-date')?.textContent || new Date().toLocaleDateString();
				const author = header.querySelector('.guide-author')?.textContent?.replace('By ', '') || '';
				
				// Title on left
				pdf.setFontSize(14);
				pdf.setFont(undefined, 'bold');
				pdf.text(title, margin, currentY);
				
				// Date on right
				pdf.setFontSize(10);
				pdf.setFont(undefined, 'normal');
				const dateWidth = pdf.getTextWidth(date);
				pdf.text(date, margin + availableWidth - dateWidth, currentY);
				
				currentY += 6;
				
				// Author below if exists
				if (author) {
					pdf.text(`By ${author}`, margin, currentY);
					currentY += 6;
				}
				
				currentY += 8; // Space after header
			}
			
			// PROCESS ALL CONTENT IN ORDER - NO FANCY GROUPING BULLSHIT
			const children = Array.from(cardGrid.children);
			
			for (let i = 0; i < children.length; i++) {
				if (currentPage > MAX_PAGES) break;
				
				const element = children[i];
				
				// Skip header we already processed
				if (element.classList.contains('upgrade-guide-header')) continue;
				
				// ESTIMATE HEIGHT - SIMPLE
				let elementHeight = this.estimateElementHeight(element);
				
				// CHECK PAGE BREAK
				if (currentY + elementHeight > pageHeight - margin) {
					pdf.addPage();
					currentPage++;
					currentY = margin;
					if (currentPage > MAX_PAGES) break;
				}
				
				// RENDER BASED ON TYPE
				if (element.classList.contains('guide-cardlist')) {
					currentY = await this.renderDecklistAsText(pdf, element, margin, currentY, availableWidth, pageHeight);
				} else if (element.classList.contains('card-frame')) {
					// COLLECT ALL CARDS IN A ROW
					const cardFrames = [];
					for (let j = i; j < children.length; j++) {
						if (children[j].classList.contains('card-frame')) {
							cardFrames.push(children[j]);
						} else {
							break;
						}
					}
					
					if (cardFrames.length > 0) {
						currentY = await this.renderCardGridSection(
							pdf, cardFrames, margin, currentY, availableWidth, pageHeight, true
						);
						i += cardFrames.length - 1; // Skip processed cards
					}
				} else {
					// REGULAR TEXT - TIGHT SPACING
					currentY = this.renderCompactTextElement(pdf, element, margin, currentY, availableWidth);
				}
				
				currentY += 3; // Minimal spacing between elements
			}
			
			// ADD PAGE NUMBERS
			this.addPageNumbersToPDF(pdf, pageWidth, pageHeight);
			
			// SAVE PDF
			pdf.save(filename);
			this.hidePDFLoading();
			console.log('✅ Upgrade Guide PDF generated');
			return true;
			
		} catch (error) {
			this.hidePDFLoading();
			console.error('❌ PDF generation failed:', error);
			throw error;
		}
	}

	// === PAGE NUMBERING ===
	/**
	 * Adds consistent page numbering to PDF document
	 */
	addPageNumbersToPDF(pdf, pageWidth, pageHeight) {
		const totalPages = pdf.internal.getNumberOfPages();
		
		for (let i = 1; i <= totalPages; i++) {
			pdf.setPage(i);
			pdf.setFontSize(8);
			pdf.setTextColor(100, 100, 100);
			pdf.text(`Page ${i} of ${totalPages}`, pageWidth - 25, pageHeight - 5);
		}
	}
	
	// =============================================================================
	// DECKLIST TEXT RENDERING FOR UPGRADE GUIDES
	// =============================================================================

	/**
	 * Parse decklist DOM element into structured data for PDF rendering
	 * Extracts title, section headers, and card lists from the nested DOM structure
	 * @param {Element} element - DOM element with class 'guide-cardlist'
	 * @returns {Object} Structured decklist data with title and sections
	 */
	parseDecklistStructure(element) {
		console.log('🔍 Parsing decklist structure from DOM');
		
		const decklist = {
			title: '',
			sections: []
		};
		
		try {
			// Extract decklist title (h4 element)
			const titleElement = element.querySelector('h4');
			if (titleElement) {
				decklist.title = titleElement.textContent.trim();
				console.log(`📋 Decklist title: ${decklist.title}`);
			}
			
			// Extract all sections from the decklist-section container
			const sectionElements = element.querySelectorAll('.decklist-section > div');
			console.log(`📋 Found ${sectionElements.length} sections in decklist`);
			
			sectionElements.forEach((sectionEl, index) => {
				const section = {
					header: '',
					cards: []
				};
				
				// Extract section header (h5 element)
				const headerElement = sectionEl.querySelector('h5');
				if (headerElement) {
					section.header = headerElement.textContent.trim();
				} else {
					section.header = `Section ${index + 1}`;
				}
				
				// Extract card list items
				const cardElements = sectionEl.querySelectorAll('li');
				cardElements.forEach(cardEl => {
					const cardText = cardEl.textContent.trim();
					if (cardText) {
						section.cards.push(cardText);
					}
				});
				
				console.log(`📋 Section "${section.header}": ${section.cards.length} cards`);
				decklist.sections.push(section);
			});
			
		} catch (error) {
			console.error('❌ Error parsing decklist structure:', error);
		}
		
		return decklist;
	}

	/**
	 * Calculate approximate heights for each section in millimeters
	 * Used for column distribution and layout planning
	 * @param {Array} sections - Decklist sections from parseDecklistStructure
	 * @returns {Array} Sections with calculated height properties
	 */
	calculateSectionHeights(sections) {
		const sectionsWithHeights = [];
		
		// PDF layout constants (in millimeters)
		const HEADER_HEIGHT = 6; // 10pt header with spacing
		const CARD_HEIGHT = 3.5; // 9pt card text with line spacing
		const SECTION_SPACING = 3; // Space between sections
		
		sections.forEach(section => {
			// Calculate total height: header + cards + spacing
			const cardsHeight = section.cards.length * CARD_HEIGHT;
			const totalHeight = HEADER_HEIGHT + cardsHeight + SECTION_SPACING;
			
			sectionsWithHeights.push({
				...section,
				height: totalHeight,
				headerHeight: HEADER_HEIGHT,
				cardHeight: CARD_HEIGHT
			});
			
			console.log(`📏 Section "${section.header}": ${totalHeight.toFixed(1)}mm (${section.cards.length} cards)`);
		});
		
		return sectionsWithHeights;
	}

	/**
	 * Distribute sections across 3 columns using sequential filling
	 * Fills column 1 completely before moving to column 2, then column 3
	 * Ensures sections are never split across columns
	 * @param {Array} sections - Sections with calculated heights
	 * @param {number} availableHeight - Maximum height per column in mm
	 * @returns {Array} 3-column array with distributed sections
	 */
	distributeSectionsToColumns(sections, availableHeight) {
		const columns = [[], [], []];
		let currentColumn = 0;
		let currentHeight = 0;
		
		console.log(`📊 Distributing ${sections.length} sections across 3 columns (max ${availableHeight}mm per column)`);
		
		for (const section of sections) {
			const sectionHeight = section.height;
			
			// Check if section fits in current column
			// If not and we have more columns available, move to next column
			if (currentHeight + sectionHeight > availableHeight && currentColumn < 2) {
				console.log(`↪️ Column ${currentColumn + 1} full (${currentHeight.toFixed(1)}mm), moving to column ${currentColumn + 2}`);
				currentColumn++;
				currentHeight = 0;
			}
			
			// Add section to current column
			columns[currentColumn].push(section);
			currentHeight += sectionHeight;
			
			console.log(`📦 Added "${section.header}" to column ${currentColumn + 1}, height: ${currentHeight.toFixed(1)}mm`);
		}
		
		// Log distribution results
		columns.forEach((colSections, index) => {
			const colHeight = colSections.reduce((sum, section) => sum + section.height, 0);
			console.log(`✅ Column ${index + 1}: ${colSections.length} sections, ${colHeight.toFixed(1)}mm total`);
		});
		
		return columns;
	}

	/**
	 * Render decklist as PDF text with proper 3-column layout
	 * Uses jsPDF native text methods for clean, scalable text rendering
	 * @param {jsPDF} pdf - PDF document instance
	 * @param {Element} element - Decklist DOM element
	 * @param {number} startX - Starting X position in mm
	 * @param {number} startY - Starting Y position in mm
	 * @param {number} availableWidth - Total width available in mm
	 * @param {number} pageHeight - Page height for overflow calculations
	 * @returns {number} New Y position after rendering complete decklist
	 */
	renderDecklistAsText(pdf, element, startX, startY, availableWidth, pageHeight) {
		console.log('🎨 Rendering decklist as PDF text');
		
		// Parse decklist structure from DOM
		const decklistData = this.parseDecklistStructure(element);
		if (!decklistData.sections || decklistData.sections.length === 0) {
			console.warn('⚠️ No decklist sections found, skipping rendering');
			return startY;
		}
		
		// Calculate section heights for layout planning
		const sectionsWithHeights = this.calculateSectionHeights(decklistData.sections);
		
		// Calculate available height for columns (leave margin at bottom)
		const availableHeight = pageHeight - startY - 15; // 15mm bottom margin
		
		// Distribute sections across 3 columns
		const columns = this.distributeSectionsToColumns(sectionsWithHeights, availableHeight);
		
		// Calculate column dimensions
		const columnWidth = (availableWidth - 10) / 3; // 10mm total gutter space
		const columnGutter = 5; // 5mm between columns
		
		let currentY = startY;
		
		// Render decklist title (centered above columns)
		if (decklistData.title) {
			pdf.setFontSize(11);
			pdf.setFont(undefined, 'bold');
			pdf.text(decklistData.title, startX + availableWidth / 2, currentY, { align: 'center' });
			currentY += 8; // Space after title
		}
		
		// Render each column
		columns.forEach((columnSections, columnIndex) => {
			if (columnSections.length === 0) return;
			
			const columnX = startX + (columnIndex * (columnWidth + columnGutter));
			let columnY = currentY;
			
			console.log(`🖋️ Rendering column ${columnIndex + 1} at X:${columnX}mm, Y:${columnY}mm`);
			
			// Render each section in this column
			columnSections.forEach(section => {
				// Render section header
				pdf.setFontSize(10);
				pdf.setFont(undefined, 'bold');
				pdf.text(section.header, columnX, columnY);
				columnY += section.headerHeight;
				
				// Render card list
				pdf.setFontSize(9);
				pdf.setFont(undefined, 'normal');
				
				section.cards.forEach(cardText => {
					// Ensure card text fits in column width
					const maxTextWidth = columnWidth - 2; // 2mm padding
					const lines = pdf.splitTextToSize(cardText, maxTextWidth);
					
					lines.forEach(line => {
						pdf.text(line, columnX, columnY);
						columnY += section.cardHeight;
					});
				});
				
				// Add spacing after section
				columnY += 2;
			});
			
			console.log(`✅ Column ${columnIndex + 1} rendered, final Y: ${columnY}mm`);
		});
		
		// Return the maximum Y position from all columns
		const finalY = currentY + Math.max(...columns.map((col, index) => {
			const colHeight = col.reduce((sum, section) => sum + section.height, 0);
			return colHeight;
		}));
		
		console.log(`🎉 Decklist rendering complete, new Y position: ${finalY}mm`);
		return finalY;
	}

	/**
	 * Render text content elements as PDF text (headers, paragraphs)
	 * Uses jsPDF native text methods for clean, scalable rendering
	 * @param {jsPDF} pdf - PDF document instance
	 * @param {Element} element - Text DOM element
	 * @param {number} x - X position in mm
	 * @param {number} y - Y position in mm
	 * @param {number} width - Available width in mm
	 * @returns {number} New Y position after rendering
	 */
	renderTextElement(pdf, element, x, y, width) {
		console.log(`📝 Rendering text element: ${element.className}`);
		
		const text = element.textContent.trim();
		if (!text) return y;
		
		// Determine font size and style based on element class
		let fontSize = 10;
		let isBold = false;
		
		if (element.classList.contains('guide-title') || 
			element.classList.contains('guide-header')) {
			fontSize = 11;
			isBold = true;
		} else if (element.classList.contains('section-header')) {
			fontSize = 12;
			isBold = true;
		} else {
			fontSize = 10; // Regular paragraphs
			isBold = false;
		}
		
		// Apply font settings
		pdf.setFontSize(fontSize);
		pdf.setFont(undefined, isBold ? 'bold' : 'normal');
		
		// Split text into lines that fit available width
		const maxTextWidth = width - 4; // 4mm padding
		const lines = pdf.splitTextToSize(text, maxTextWidth);
		
		// Calculate total height needed
		const lineHeight = fontSize * 0.35; // Convert pt to mm (approximate)
		const totalHeight = lines.length * lineHeight;
		
		// Render each line
		lines.forEach((line, index) => {
			pdf.text(line, x + 2, y + (index * lineHeight) + lineHeight);
		});
		
		// Return new Y position
		const newY = y + totalHeight + 4; // 4mm spacing after element
		console.log(`📝 Text rendered, ${lines.length} lines, new Y: ${newY}mm`);
		return newY;
	}

	async renderUpgradeCardToPDF(pdf, cardElement, x, y, width, height) {
		console.log('🃏 Rendering upgrade card - SIMPLE FIX');
		
		// HIDE inclusion percentage temporarily
		const inclusionElement = cardElement.querySelector('.inclusion-percentage');
		let originalDisplay = '';
		if (inclusionElement) {
			originalDisplay = inclusionElement.style.display;
			inclusionElement.style.display = 'none';
		}
		
		try {
			// USE THE EXACT SAME METHOD THAT WORKS FOR COMMANDER LISTS
			await this.addPrintCardToPDF(pdf, cardElement, x, y, width, height);
			console.log('✅ Upgrade card rendered successfully');
		} catch (error) {
			console.error('❌ Card render failed:', error);
			throw error;
		} finally {
			// RESTORE inclusion element
			if (inclusionElement) {
				inclusionElement.style.display = originalDisplay;
			}
		}
	}
	
	/**
	 * Render card grid section using existing commander list PDF logic
	 * Reuses the proven card rendering system for consistent quality
	 */
	async renderCardGridSection(pdf, cardFrames, startX, startY, availableWidth, pageHeight, isUpgradeGuide = false) {
		console.log(`🃏 Rendering ${cardFrames.length} cards using ${isUpgradeGuide ? 'UPGRADE' : 'commander'} list system`);
		
		const cardsPerRow = 4;
		const cardsPerColumn = 6;
		const sectionHeaderHeight = 8;
		
		const cardWidth = availableWidth / cardsPerRow;
		const cardHeight = (pageHeight - (2 * 15)) / cardsPerColumn; // 15mm margins
		
		let currentY = startY;
		let currentCol = 0;
		
		// Check if we need a new page for this card section
		if (currentY + cardHeight > pageHeight - 15) {
			pdf.addPage();
			currentY = 15;
		}
		
		// Render cards in grid layout (same as commander lists)
		for (let i = 0; i < cardFrames.length; i++) {
			const card = cardFrames[i];
			
			// Check if we need new row
			if (currentCol >= cardsPerRow) {
				currentCol = 0;
				currentY += cardHeight;
			}
			
			// Check if card fits on current page
			if (currentY + cardHeight > pageHeight - 15) {
				pdf.addPage();
				currentY = 15;
				currentCol = 0;
			}
			
			const cardX = startX + (currentCol * cardWidth);
			
			// USE THE APPROPRIATE CARD RENDERER
			if (isUpgradeGuide) {
				await this.renderUpgradeCardToPDF(pdf, card, cardX, currentY, cardWidth, cardHeight);
			} else {
				await this.addPrintCardToPDF(pdf, card, cardX, currentY, cardWidth, cardHeight);
			}
			
			currentCol++;
		}
		
		// Move to next row after section
		if (currentCol !== 0) {
			currentY += cardHeight;
		}
		
		return currentY;
	}
		
	/**
	 * Group elements by header-content relationships to prevent page breaks
	 * Ensures headers stay with their following content blocks
	 * @param {Array} elements - DOM elements from cardGrid
	 * @returns {Array} Grouped elements where headers are with their content
	 */
	groupContentWithHeaders(elements) {
		console.log('📋 Grouping elements by header-content relationships');
		
		const groups = [];
		let currentGroup = [];
		
		for (const element of elements) {
			const isHeader = element.classList.contains('guide-header') || 
							element.classList.contains('section-header') ||
							element.tagName?.match(/^H[1-6]$/);
			
			if (isHeader && currentGroup.length > 0) {
				// Start new group when we encounter a header (and we already have a group)
				console.log(`📦 Creating new group with ${currentGroup.length} elements`);
				groups.push(currentGroup);
				currentGroup = [element];
			} else {
				// Add to current group
				currentGroup.push(element);
			}
		}
		
		// Don't forget the last group
		if (currentGroup.length > 0) {
			console.log(`📦 Final group with ${currentGroup.length} elements`);
			groups.push(currentGroup);
		}
		
		console.log(`✅ Created ${groups.length} content groups`);
		return groups;
	}

	/**
	 * Estimate total height of a content group to prevent page breaks within groups
	 * Uses conservative estimates to ensure groups stay together
	 * @param {Array} group - Group of DOM elements
	 * @param {number} availableWidth - Available width in mm
	 * @param {number} pageHeight - Page height in mm
	 * @returns {number} Estimated total height in mm
	 */
	estimateGroupHeight(group, availableWidth, pageHeight) {
		let totalHeight = 0;
		
		console.log(`📏 Estimating height for group with ${group.length} elements`);
		
		for (const element of group) {
			if (element.classList.contains('guide-cardlist')) {
				// Estimate decklist height using our precise calculation
				try {
					const decklistData = this.parseDecklistStructure(element);
					if (decklistData.sections && decklistData.sections.length > 0) {
						const sectionsWithHeights = this.calculateSectionHeights(decklistData.sections);
						const decklistHeight = sectionsWithHeights.reduce((sum, section) => sum + section.height, 0);
						totalHeight += decklistHeight + 15; // Add title and spacing
						console.log(`📏 Decklist estimated: ${decklistHeight}mm`);
					}
				} catch (error) {
					// Fallback estimate
					totalHeight += 80;
				}
			} else if (element.classList.contains('card-frame')) {
				// Card grid section - count all consecutive card frames in group
				const cardIndex = group.indexOf(element);
				const remainingElements = group.slice(cardIndex);
				const cardFrames = remainingElements.filter(el => el.classList.contains('card-frame'));
				
				if (cardFrames.length > 0) {
					const cardsPerRow = 4;
					const cardHeight = 45; // Standard card height
					const rows = Math.ceil(cardFrames.length / cardsPerRow);
					const cardSectionHeight = rows * cardHeight + 10; // 10mm for spacing
					totalHeight += cardSectionHeight;
					console.log(`📏 Card grid estimated: ${cardSectionHeight}mm for ${cardFrames.length} cards`);
					break; // Don't count individual card frames multiple times
				}
			} else if (element.classList.contains('upgrade-guide-header')) {
				// Guide header - fixed height
				totalHeight += 30;
			} else if (element.classList.contains('guide-header') || element.classList.contains('section-header')) {
				// Headers - fixed height with spacing
				totalHeight += 15;
			} else {
				// Text content - estimate based on text length
				const text = element.textContent || '';
				const approxLines = Math.ceil(text.length / 80); // Rough chars per line
				totalHeight += Math.max(20, approxLines * 5); // 5mm per line
			}
			
			// Add spacing between elements
			totalHeight += 5;
		}
		
		console.log(`📏 Total group height: ${totalHeight}mm`);
		return totalHeight;
	}

	
	/**
	 * SIMPLE height estimation - no bullshit
	 */
	estimateElementHeight(element) {
		if (element.classList.contains('guide-cardlist')) {
			const sections = element.querySelectorAll('.decklist-section > div');
			let cardCount = 0;
			sections.forEach(section => {
				cardCount += section.querySelectorAll('li').length;
			});
			return Math.max(40, cardCount * 2.5 + 20); // Tight spacing
		} else if (element.classList.contains('card-frame')) {
			return 45; // Standard card height
		} else if (element.classList.contains('guide-header') || element.classList.contains('section-header')) {
			return 12; // Header height
		} else {
			// Text content - tight estimation
			const text = element.textContent || '';
			const lines = Math.ceil(text.length / 80);
			return Math.max(15, lines * 4 + 5); // Much tighter
		}
	}

	/**
	 * TIGHT text rendering - minimal spacing
	 */
	renderCompactTextElement(pdf, element, x, y, width) {
		const text = element.textContent.trim();
		if (!text) return y;
		
		let fontSize = 10;
		let isBold = false;
		
		if (element.classList.contains('guide-title') || element.classList.contains('guide-header')) {
			fontSize = 11;
			isBold = true;
		} else if (element.classList.contains('section-header')) {
			fontSize = 12;
			isBold = true;
		}
		
		pdf.setFontSize(fontSize);
		pdf.setFont(undefined, isBold ? 'bold' : 'normal');
		
		const maxTextWidth = width - 4;
		const lines = pdf.splitTextToSize(text, maxTextWidth);
		
		// TIGHT line spacing
		const lineHeight = fontSize * 0.3;
		const totalHeight = lines.length * lineHeight;
		
		lines.forEach((line, index) => {
			pdf.text(line, x + 2, y + (index * lineHeight) + lineHeight);
		});
		
		return y + totalHeight + 2; // Minimal spacing after
	}

}

window.ExportManager = ExportManager;

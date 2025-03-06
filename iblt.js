// Initialize SipHash with random keys
const hasher = new SipHash(
    Math.floor(Math.random() * 0xFFFFFFFF),
    Math.floor(Math.random() * 0xFFFFFFFF)
);

let numCells = 6;
let numHash = 3;
let insertedItems = new Map();
let recoveredItems = new Map();
let insertedItemsB = new Map();
let svg;
let cellsData;
let cellGroups;

// capacity thresholds
const RECOVERABLE_CAPACITY = 0.33;  // 33% of table size for reliable recovery
const WARNING_THRESHOLD = 0.8;      // 80% of max recoverable capacity
const DANGER_THRESHOLD = 0.95;      // 95% of max recoverable capacity

// Update the existing insert and peel functions
function insertPair() {
    const key = parseInt(document.getElementById("keyInput").value);
    const value = parseInt(document.getElementById("valueInput").value);
    const targetIBLT = document.getElementById("ibltSelector").value;

    if (isNaN(key) || isNaN(value)) {
        alert("Please enter valid numbers for key and value");
        return;
    }

    // Choose target IBLT
    const items = targetIBLT === 'A' ? insertedItems : insertedItemsB;
    const itemCount = items.size;
    const maxCapacity = Math.floor(numCells * RECOVERABLE_CAPACITY);

    if (itemCount >= maxCapacity) {
        alert("Maximum recoverable capacity reached! Cannot insert more items.");
        return;
    }

    const indices = getIndices(key);
    items.set(key, value);

    if (targetIBLT === 'A') {
        // Update visualization only for IBLT A
        indices.forEach(i => {
            cellsData[i].count++;
            cellsData[i].keySum ^= key;
            cellsData[i].valSum ^= value;
            animateCell(i);
        });
        updateVisualization();
        updateCapacityStatus();
    }

    updateTables();
    document.getElementById("keyInput").value = "";
    document.getElementById("valueInput").value = "";
}

function peelPair() {
    let found = false;

    for (let i = 0; i < numCells; i++) {
        if (cellsData[i].count === 1) {
            const key = cellsData[i].keySum;
            const value = cellsData[i].valSum;
            const indices = getIndices(key);

            indices.forEach(idx => {
                cellsData[idx].count--;
                cellsData[idx].keySum ^= key;
                cellsData[idx].valSum ^= value;
                animateCell(idx);  // Animate each affected cell
            });

            recoveredItems.set(key, value);
            insertedItems.delete(key);  // Remove item from inserted set
            found = true;
            break;
        }
    }

    if (!found) {
        alert("No pure cell found for peeling");
        return;
    }

    updateVisualization();
    updateTables();
    updateHashRecommendation();
    updateCapacityStatus();
}

function subtractIBLTs() {
    // Create difference IBLT by subtracting B from A
    const diffCells = cellsData.map(cell => ({
        index: cell.index,
        count: cell.count,
        keySum: cell.keySum,
        valSum: cell.valSum
    }));

    // Subtract B's items from the difference IBLT
    insertedItemsB.forEach((value, key) => {
        const indices = getIndices(key);
        indices.forEach(i => {
            diffCells[i].count--;
            diffCells[i].keySum ^= key;
            diffCells[i].valSum ^= value;
        });
    });

    // Recover items from difference IBLT
    const differenceItems = new Map();
    let found;

    do {
        found = false;
        for (let i = 0; i < diffCells.length; i++) {
            if (Math.abs(diffCells[i].count) === 1) {
                const key = diffCells[i].keySum;
                const value = diffCells[i].valSum;
                const source = diffCells[i].count === 1 ? 'Only in A' : 'Only in B';

                differenceItems.set(key, { value, source });

                const indices = getIndices(key);
                indices.forEach(idx => {
                    diffCells[idx].count -= Math.sign(diffCells[idx].count);
                    diffCells[idx].keySum ^= key;
                    diffCells[idx].valSum ^= value;
                });

                found = true;
                break;
            }
        }
    } while (found);

    // Update difference table
    const diffTbody = document.querySelector("#differenceTable table tbody");
    diffTbody.innerHTML = "";

    differenceItems.forEach((data, key) => {
        const row = diffTbody.insertRow();
        row.insertCell().textContent = `Item ${row.rowIndex}`;
        row.insertCell().textContent = key;
        row.insertCell().textContent = data.value;
        row.insertCell().textContent = data.source;
    });

    document.getElementById("differenceTable").style.display = "block";
}


function initializeVisualization() {
    // Clear existing visualization
    d3.select("#viz svg").remove();

    const containerWidth = document.getElementById("viz").clientWidth;
    const minCellWidth = 132;
    const maxCellWidth = 256;

    // Calculate responsive cell dimensions
    const cellWidth = Math.max(minCellWidth, Math.min(maxCellWidth, containerWidth / numCells - 10));
    const cellHeight = document.getElementById('showBinaryBtn').checked ? cellWidth * 1.2 : cellWidth;
    const cellSpacing = Math.max(5, Math.min(10, containerWidth * 0.01));

    // Calculate cells per row based on container width
    const cellsPerRow = Math.max(1, Math.floor((containerWidth) / (cellWidth + cellSpacing)));
    const rows = Math.ceil(numCells / cellsPerRow);

    // Calculate SVG dimensions
    const svgWidth = Math.min(
        containerWidth,
        (cellWidth + cellSpacing) * Math.min(numCells, cellsPerRow)
    );
    const svgHeight = (cellHeight + cellSpacing) * rows;

    // Create SVG container
    svg = d3.select("#viz")
        .append("svg")
        .attr("width", "100%")
        .attr("height", svgHeight)
        .attr("viewBox", `0 0 ${svgWidth} ${svgHeight}`);

    // Initialize cells
    cellsData = d3.range(numCells).map(d => ({
        index: d,
        count: 0,
        keySum: 0,
        valSum: 0
    }));

    // Position cells
    cellGroups = svg.selectAll("g.cell")
        .data(cellsData)
        .enter()
        .append("g")
        .attr("class", "cell")
        .attr("transform", (d, i) => {
            const row = Math.floor(i / cellsPerRow);
            const col = i % cellsPerRow;
            const x = (col * (cellWidth + cellSpacing)) + (cellSpacing / 2);
            const y = (row * (cellHeight + cellSpacing)) + (cellSpacing / 2);
            return `translate(${x}, ${y})`;
        });

    // Draw cell rectangles
    cellGroups.append("rect")
        .attr("width", cellWidth)
        .attr("height", cellHeight)
        .attr("rx", 5)
        .attr("ry", 5);

    // Update text positioning to be relative to cell size
    cellGroups.append("text")
        .attr("class", "cell-text count")
        .attr("x", cellWidth / 2)
        .attr("y", cellHeight * 0.3)
        .attr("text-anchor", "middle")
        .text(d => "Count: " + d.count);

    cellGroups.append("text")
        .attr("class", "cell-text key")
        .attr("x", cellWidth / 2)
        .attr("y", cellHeight * 0.45)
        .attr("text-anchor", "middle")
        .text(d => "KeySum: " + d.keySum);

    cellGroups.append("text")
        .attr("class", "cell-text val")
        .attr("x", cellWidth / 2)
        .attr("y", cellHeight * 0.6)
        .attr("text-anchor", "middle")
        .text(d => "ValSum: " + d.valSum);

    updateBinaryDisplay();
}

function updateVisualization() {
    // Calculate current load factor
    const totalItems = Array.from(insertedItems.keys()).length;
    const loadFactor = totalItems / numCells;

    // Update cell colors based on capacity and count
    cellGroups
        .classed("over-capacity", loadFactor > RECOVERABLE_CAPACITY)
        .classed("count-1", d => d.count === 1)
        .classed("count-many", d => d.count > 1);

    // Update text content
    cellGroups.select("text.count")
        .text(d => "Count: " + d.count);

    cellGroups.select("text.key")
        .text(d => "KeySum: " + d.keySum);

    cellGroups.select("text.val")
        .text(d => "ValSum: " + d.valSum);

    updateBinaryDisplay();
}

function animateCell(index) {
    const cell = cellGroups.filter(d => d.index === index);
    cell.classed("active", true)
        .transition()
        .duration(300)
        .transition()
        .duration(300)
        .on("end", function () {
            d3.select(this).classed("active", false);
        });
}

// Function to get hash indices for a key
function getIndices(key) {
    const indices = new Set();
    while (indices.size < numHash) {
        const idx = hasher.hash(key, indices.size) % numCells;
        indices.add(idx);
    }
    return Array.from(indices);
}

function updateTables() {
    const insertedTbody = document.querySelector("#insertedTable tbody");
    const recoveredTbody = document.querySelector("#recoveredTable tbody");

    insertedTbody.innerHTML = "";
    recoveredTbody.innerHTML = "";

    insertedItems.forEach((value, key) => {
        const row = insertedTbody.insertRow();
        row.insertCell().textContent = `Item ${row.rowIndex}`;
        row.insertCell().textContent = key;
        row.insertCell().textContent = value;
    });

    recoveredItems.forEach((value, key) => {
        const row = recoveredTbody.insertRow();
        row.insertCell().textContent = `Item ${row.rowIndex}`;
        row.insertCell().textContent = key;
        row.insertCell().textContent = value;
    });

    // Update IBLT B table
    const insertedTbodyB = document.querySelector("#insertedTableB tbody");
    insertedTbodyB.innerHTML = "";

    insertedItemsB.forEach((value, key) => {
        const row = insertedTbodyB.insertRow();
        row.insertCell().textContent = `Item ${row.rowIndex}`;
        row.insertCell().textContent = key;
        row.insertCell().textContent = value;
    });
}

// Update optimal hash function calculation to use max capacity
function calculateOptimalHashFunctions(tableSize) {
    const maxCapacity = Math.floor(tableSize * RECOVERABLE_CAPACITY);
    if (maxCapacity === 0) return 2; // minimum value
    const optimal = Math.round(0.693 * (tableSize / maxCapacity)); // ln(2) ≈ 0.693
    return Math.max(2, Math.min(5, optimal)); // Clamp between 2 and 5
}

function updateHashRecommendation() {
    const optimal = calculateOptimalHashFunctions(numCells);
    const notification = document.getElementById('hashRecommendation');
    const text = document.getElementById('recommendationText');

    if (optimal !== numHash) {
        const maxCapacity = Math.floor(numCells * RECOVERABLE_CAPACITY);
        text.textContent = `Recommended number of hash functions for table size ${numCells} (max ${maxCapacity} items): ${optimal}`;
        notification.classList.add('show');
    } else {
        notification.classList.remove('show');
    }
}

function updateCapacityStatus() {
    const itemCount = insertedItems.size;
    const maxCapacity = Math.floor(numCells * RECOVERABLE_CAPACITY);
    const percentage = (itemCount / maxCapacity) * 100;

    const capacityText = document.getElementById('capacityText');
    const capacityFill = document.getElementById('capacityFill');

    capacityText.textContent = `${itemCount}/${maxCapacity} items (${percentage.toFixed(1)}% of recoverable capacity)`;
    capacityFill.style.width = `${Math.min(100, percentage)}%`;

    // Update color based on thresholds
    capacityFill.classList.remove('warning', 'danger');
    if (percentage >= DANGER_THRESHOLD * 100) {
        capacityFill.classList.add('danger');
    } else if (percentage >= WARNING_THRESHOLD * 100) {
        capacityFill.classList.add('warning');
    }
}

function toBinary(num, bits = 32) {
    return (num >>> 0).toString(2).padStart(bits, '0')
        .replace(/(.{8})/g, '$1 ').trim();
}

function updateBinaryDisplay() {
    const showBinary = document.getElementById('showBinaryBtn').checked;

    // Remove existing binary displays
    cellGroups.selectAll('.binary-view').remove();

    if (showBinary) {
        cellGroups.each(function (d, i) {
            const cell = d3.select(this);
            const cellWidth = parseFloat(cell.select('rect').attr('width'));
            const cellHeight = parseFloat(cell.select('rect').attr('height'));
            const binaryY = cellHeight * 0.75; // Position in lower third of cell

            // Count binary
            cell.append('text')
                .attr('class', 'binary-view')
                .attr('x', cellWidth / 2)
                .attr('y', binaryY)
                .attr('text-anchor', 'middle')
                .text('c:' + toBinary(d.count, 8));

            // KeySum binary
            cell.append('text')
                .attr('class', 'binary-view')
                .attr('x', cellWidth / 2)
                .attr('y', binaryY + 6)  // Smaller spacing between lines
                .attr('text-anchor', 'middle')
                .text('k:' + toBinary(d.keySum));

            // ValSum binary
            cell.append('text')
                .attr('class', 'binary-view')
                .attr('x', cellWidth / 2)
                .attr('y', binaryY + 12)  // Smaller spacing between lines
                .attr('text-anchor', 'middle')
                .text('v:' + toBinary(d.valSum));
        });
    }
}

// Update apply recommendation handler
document.getElementById('applyRecommendationBtn').onclick = function () {
    const optimal = calculateOptimalHashFunctions(numCells);
    document.getElementById('hashFunctionsInput').value = optimal;
    document.getElementById('updateConfigBtn').click();
};

// Add configuration update handler
document.getElementById("updateConfigBtn").onclick = function () {
    numCells = parseInt(document.getElementById("tableSizeInput").value);
    numHash = parseInt(document.getElementById("hashFunctionsInput").value);

    // Reset the IBLT
    insertedItems.clear();
    recoveredItems.clear();
    initializeVisualization();
    updateTables();
    updateHashRecommendation();
    updateCapacityStatus();
};

document.addEventListener('DOMContentLoaded', function () {
    // Initialize the visualization
    initializeVisualization();
    updateHashRecommendation();
    updateCapacityStatus();

    // Set up event handlers
    document.getElementById("insertBtn").addEventListener('click', insertPair);
    document.getElementById("peelBtn").addEventListener('click', peelPair);
    document.getElementById("updateConfigBtn").addEventListener('click', function () {
        numCells = parseInt(document.getElementById("tableSizeInput").value);
        numHash = parseInt(document.getElementById("hashFunctionsInput").value);

        // Reset the IBLT
        insertedItems.clear();
        recoveredItems.clear();
        initializeVisualization();
        updateTables();
        updateHashRecommendation();
        updateCapacityStatus();
    });

    document.getElementById("applyRecommendationBtn").addEventListener('click', function () {
        const optimal = calculateOptimalHashFunctions(numCells);
        document.getElementById("hashFunctionsInput").value = optimal;
        document.getElementById("updateConfigBtn").click();
    });

    // Add subtract button handler
    document.getElementById("subtractBtn").addEventListener('click', function () {
        subtractIBLTs();
    });

    document.getElementById('showBinaryBtn').addEventListener('change', function () {
        initializeVisualization(); // Reinitialize with new height
    });
});

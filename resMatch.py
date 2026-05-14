import csv

# Read all rows from the CSV
with open('trades.csv', 'r') as f:
    reader = csv.reader(f)
    rows = list(reader)

# Build a map of periodTimestamp -> resolution value
resolution_map = {}
for row in rows:
    if len(row) > 9 and row[9] == "resolution":
        period_timestamp = row[3]
        resolution_value = row[10] if len(row) > 10 else ""
        resolution_map[period_timestamp] = resolution_value

# Update buy rows with resolution values
for row in rows:
    if len(row) > 9 and row[9] != "resolution" and row[9] != "":
        # This is a buy row
        period_timestamp = row[3]
        if period_timestamp in resolution_map:
            if len(row) <= 10:
                row.append(resolution_map[period_timestamp])
            else:
                row[10] = resolution_map[period_timestamp]

# Filter out resolution-only rows, but keep the header row
output_rows = []
for i, row in enumerate(rows):
    if i == 0:
        output_rows.append(row)
        continue
    if len(row) > 9 and row[9] == "resolution":
        continue
    output_rows.append(row)

# Write back to CSV
with open('tradesFill.csv', 'w', newline='') as f:
    writer = csv.writer(f)
    writer.writerows(output_rows)

print("Resolution values filled in successfully!")
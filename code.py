import numpy as np
import matplotlib.pyplot as plt
from collections import deque
import math

# --- Configuration ---
BACKGROUND_COLOR = 0 # Typically black in ARC examples

# --- Visualization Helper ---
def plot_grid(ax, grid, title=""):
    """Plots a grid using matplotlib."""
    cmap = plt.cm.get_cmap('viridis', 10) # Use a discrete colormap
    norm = plt.Normalize(vmin=0, vmax=9)
    ax.imshow(grid, cmap=cmap, norm=norm, interpolation='nearest', extent=[-0.5, grid.shape[1]-0.5, grid.shape[0]-0.5, -0.5])
    ax.set_xticks(np.arange(grid.shape[1]))
    ax.set_yticks(np.arange(grid.shape[0]))
    ax.grid(True, which='both', color='grey', linewidth=0.5)
    ax.set_xticklabels([])
    ax.set_yticklabels([])
    ax.set_title(title)

# --- Object Representation ---
class GridObject:
    """Represents a single connected object on the grid."""
    def __init__(self, color, pixels, grid_shape):
        self.color = color
        self.pixels = set(pixels) # Set of (row, col) tuples
        self.grid_shape = grid_shape

        if not self.pixels:
            self.bbox = None # (min_r, min_c, max_r, max_c)
            self.centroid = None # (avg_r, avg_c)
            self.size = 0
            self.modular_pos = {}
        else:
            rows, cols = zip(*self.pixels)
            self.bbox = (min(rows), min(cols), max(rows), max(cols))
            self.centroid = (sum(rows) / len(rows), sum(cols) / len(cols))
            self.size = len(self.pixels)

            # --- Add Modular/Periodic Information (Inspired by TFA/Numeral Systems) ---
            # Using top-left corner for simplicity
            min_r, min_c, _, _ = self.bbox
            self.modular_pos = {
                'y_mod_2': min_r % 2,
                'x_mod_2': min_c % 2,
                'y_mod_3': min_r % 3,
                'x_mod_3': min_c % 3,
                'y_mod_5': min_r % 5,
                'x_mod_5': min_c % 5,
                'y_dist_from_edge': min(min_r, grid_shape[0] - 1 - max(rows)),
                'x_dist_from_edge': min(min_c, grid_shape[1] - 1 - max(cols)),
            }

    def __repr__(self):
        return f"GridObject(color={self.color}, size={self.size}, bbox={self.bbox}, mod_y%3={self.modular_pos.get('y_mod_3', 'N/A')})"

# --- Structured State Representation ---
class GridState:
    """Holds the grid and extracted features (structured representation)."""
    def __init__(self, grid):
        self.grid = np.array(grid)
        self.height, self.width = self.grid.shape
        self.objects = self._find_objects() # Extract features on init

        # --- Add Global/Coarse Features (Inspired by Rods/Cones Analogy) ---
        self.unique_colors = np.unique(self.grid)
        self.non_bg_colors = self.unique_colors[self.unique_colors != BACKGROUND_COLOR]
        self.total_colored_pixels = np.sum(self.grid != BACKGROUND_COLOR)
        # Could add symmetry checks, density, etc. here

    def _find_objects(self):
        """Finds connected components of the same color."""
        objects = []
        visited = set()
        height, width = self.grid.shape

        for r in range(height):
            for c in range(width):
                pixel = (r, c)
                color = self.grid[r, c]

                if color == BACKGROUND_COLOR or pixel in visited:
                    continue

                # Start BFS for a new object
                current_object_pixels = []
                q = deque([pixel])
                visited.add(pixel)

                while q:
                    row, col = q.popleft()
                    current_object_pixels.append((row, col))

                    # Check neighbors (up, down, left, right)
                    for dr, dc in [(0, 1), (0, -1), (1, 0), (-1, 0)]:
                        nr, nc = row + dr, col + dc
                        neighbor = (nr, nc)

                        if 0 <= nr < height and 0 <= nc < width and \
                           neighbor not in visited and self.grid[nr, nc] == color:
                            visited.add(neighbor)
                            q.append(neighbor)

                if current_object_pixels:
                    objects.append(GridObject(color, current_object_pixels, self.grid.shape))
        return objects

    def __repr__(self):
        obj_summary = ", ".join([str(o) for o in self.objects])
        return f"GridState(shape={self.grid.shape}, #obj={len(self.objects)}, objs=[{obj_summary}])"

# --- ARC-like Transformations (Operating on Structured State) ---

def move_object_by_color(initial_state: GridState, target_color: int, delta_r: int, delta_c: int) -> GridState:
    """Moves all objects of a specific color by a delta."""
    print(f"\nAttempting to move color {target_color} by ({delta_r}, {delta_c})")
    new_grid = np.copy(initial_state.grid)
    moved_something = False

    # Operate based on the structured representation (objects)
    objects_to_move = [obj for obj in initial_state.objects if obj.color == target_color]

    if not objects_to_move:
        print("  No objects of target color found.")
        return GridState(new_grid) # Return state based on original grid

    for obj in objects_to_move:
        new_pixels = set()
        valid_move = True
        # Erase old position
        for r, c in obj.pixels:
            new_grid[r, c] = BACKGROUND_COLOR

        # Calculate new position
        for r, c in obj.pixels:
            nr, nc = r + delta_r, c + delta_c
            if 0 <= nr < initial_state.height and 0 <= nc < initial_state.width:
                new_pixels.add((nr, nc))
            else:
                valid_move = False
                break # Object moved out of bounds

        # Draw in new position if valid
        if valid_move:
            for nr, nc in new_pixels:
                # Simple overwrite, could add collision detection
                new_grid[nr, nc] = obj.color
            moved_something = True
            print(f"  Moved object from bbox {obj.bbox}")
        else:
            # Re-draw in original position if move was invalid
            print(f"  Move invalid (out of bounds) for object from bbox {obj.bbox}. Reverting.")
            for r, c in obj.pixels:
                new_grid[r, c] = obj.color

    # Return a NEW GridState, forcing re-analysis
    final_state = GridState(new_grid)
    print(f"  Final State: {final_state}")
    return final_state

def recolor_based_on_modular_pos(initial_state: GridState, mod_property: str, target_remainder: int, new_color: int) -> GridState:
    """Recolors objects whose modular property matches."""
    print(f"\nAttempting to recolor objects where {mod_property} == {target_remainder} to {new_color}")
    new_grid = np.copy(initial_state.grid)
    recolored_something = False

    # Use the pre-calculated modular properties in the structured representation
    for obj in initial_state.objects:
        if obj.modular_pos.get(mod_property) == target_remainder:
            print(f"  Recoloring object at {obj.bbox} (color {obj.color}, {mod_property}={obj.modular_pos.get(mod_property)})")
            for r, c in obj.pixels:
                new_grid[r, c] = new_color
            recolored_something = True

    if not recolored_something:
        print("  No objects matched the modular condition.")

    final_state = GridState(new_grid)
    print(f"  Final State: {final_state}")
    return final_state

def add_visual_count_indicator(initial_state: GridState, target_color: int, indicator_color: int, position: tuple) -> GridState:
    """Adds a visual indicator (bar) representing the count of objects of a certain color.
       Inspired by visual numeral systems (Mayan, Kaktovik)."""
    print(f"\nAdding visual indicator for count of color {target_color}")
    new_grid = np.copy(initial_state.grid)
    start_r, start_c = position

    # Count using the structured representation
    count = sum(1 for obj in initial_state.objects if obj.color == target_color)
    print(f"  Found {count} objects of color {target_color}")

    # Represent count visually (simple horizontal bar)
    max_len = initial_state.width - start_c
    bar_len = min(count, max_len)

    if start_r >= 0 and start_r < initial_state.height:
        for c_offset in range(bar_len):
            if start_c + c_offset < initial_state.width:
                new_grid[start_r, start_c + c_offset] = indicator_color
        print(f"  Added indicator bar of length {bar_len} at {position}")
    else:
        print(f"  Indicator position {position} is out of bounds.")

    final_state = GridState(new_grid)
    print(f"  Final State: {final_state}")
    return final_state


# --- Example Usage ---
if __name__ == "__main__":
    # Example Grid (10x12)
    grid_data = [
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 2, 2, 0, 0, 3, 3, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 3, 3, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 4, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 4, 0, 0, 0, 0, 0, 2, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    ]
    initial_state = GridState(grid_data)
    print(f"Initial State: {initial_state}")

    # --- Perform Transformations ---
    # 1. Move blue objects (color 2) down by 3, right by 4
    state_after_move = move_object_by_color(initial_state, target_color=2, delta_r=3, delta_c=4)

    # 2. Recolor objects based on modular position (y_mod_3 == 0) to color 5 (pink)
    state_after_recolor = recolor_based_on_modular_pos(state_after_move, mod_property='y_mod_3', target_remainder=0, new_color=5)

    # 3. Add indicator for count of original blue objects (now pink/blue) in the final state, place at row 9
    #    Let's count color 5 (pink) as a proxy for original blue objects at y%3==0
    final_state = add_visual_count_indicator(state_after_recolor, target_color=5, indicator_color=8, position=(9, 1))


    # --- Visualization ---
    fig, axes = plt.subplots(1, 4, figsize=(16, 5))
    plot_grid(axes[0], initial_state.grid, "Initial Grid")
    plot_grid(axes[1], state_after_move.grid, "After Moving Blue (2)")
    plot_grid(axes[2], state_after_recolor.grid, "After Recoloring (y%3==0 -> 5)")
    plot_grid(axes[3], final_state.grid, f"Final + Count Indicator (Pink={sum(1 for o in final_state.objects if o.color==5)})")

    fig.suptitle("Demonstrating Structured Representations and Transformations")
    plt.tight_layout(rect=[0, 0.03, 1, 0.95]) # Adjust layout to prevent title overlap
    plt.show()
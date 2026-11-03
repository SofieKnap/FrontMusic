const apiUrl = "https://restmusicproject-g5aee9cthpghdcd9.swedencentral-01.azurewebsites.net/api/Collection";

Vue.createApp({
    data() {
        return {
            allAlbums: [], // Hele samlingen bruges til statistik og kunstnerknapper.
            albums: [],    // Resultatet af den seneste søgning fra API'et.
            title: "",
            artist: "",
            sortBy: "original",
            favorites: [],
            showOnlyFavorites: false,
            selectedAlbum: null,
            loading: true,
            error: false,
            favoriteNote: "Favoritter gemmes i denne browser."
        };
    },

    // Computed genberegnes automatisk, når data eller valg ændres.
    computed: {
        artists() {
            return [...new Set(this.allAlbums.map(album => album.artist))];
        },
        totalMinutes() {
            const seconds = this.allAlbums.reduce((total, album) => total + album.duration, 0);
            return Math.round(seconds / 60);
        },
        favoriteCount() {
            return this.allAlbums.filter(album => this.isFavorite(album)).length;
        },
        visibleAlbums() {
            let result = this.albums.slice(); // Sortér en kopi, så originalrækkefølgen bevares.
            if (this.showOnlyFavorites) {
                result = result.filter(album => this.isFavorite(album));
            }
            if (this.sortBy === "title") {
                result.sort((a, b) => a.title.localeCompare(b.title, "da"));
            } else if (this.sortBy === "artist") {
                result.sort((a, b) => a.artist.localeCompare(b.artist, "da"));
            } else if (this.sortBy === "newest") {
                result.sort((a, b) => b.publicationYear - a.publicationYear);
            } else if (this.sortBy === "duration") {
                result.sort((a, b) => a.duration - b.duration);
            }
            return result;
        }
    },

    methods: {
        // Axios laver et GET-kald. params bliver til ?title=...&artist=... i URL'en.
        async searchAlbums() {
            this.loading = true;
            this.error = false;
            try {
                const response = await axios.get(apiUrl, {
                    params: { title: this.title.trim(), artist: this.artist.trim() },
                    timeout: 15000
                });
                this.albums = response.data;
                if (!this.title.trim() && !this.artist.trim()) {
                    this.allAlbums = response.data;
                }
            } catch (error) {
                this.error = true;
                console.error("Kunne ikke hente musiksamlingen", error);
            } finally {
                this.loading = false;
            }
        },
        filterArtist(name) {
            this.artist = name;
            this.searchAlbums();
        },
        resetSearch() {
            this.title = "";
            this.artist = "";
            this.showOnlyFavorites = false;
            this.searchAlbums();
        },
        albumKey(album) {
            // API'et har ikke et unikt id, så vi bruger nummerets oplysninger som nøgle.
            return JSON.stringify([album.title, album.artist, album.publicationYear]);
        },
        isFavorite(album) {
            return this.favorites.includes(this.albumKey(album));
        },
        toggleFavorite(album) {
            const key = this.albumKey(album);
            if (this.isFavorite(album)) {
                this.favorites = this.favorites.filter(favorite => favorite !== key);
            } else {
                this.favorites.push(key);
            }
            try {
                localStorage.setItem("frontmusic.favorites", JSON.stringify(this.favorites));
            } catch {
                this.favoriteNote = "Browseren kunne ikke gemme favoritterne. De virker indtil siden lukkes.";
            }
        },
        formatDuration(seconds) {
            const minutes = Math.floor(seconds / 60);
            const rest = seconds % 60;
            return minutes + ":" + rest.toString().padStart(2, "0");
        },
        coverClass(album) {
            const index = this.allAlbums.findIndex(item => this.albumKey(item) === this.albumKey(album));
            return "cover-" + (Math.max(index, 0) % 4);
        },
        openDetails(album) {
            this.selectedAlbum = album;
            // Vent på, at Vue har sat indholdet ind, før dialogen åbnes.
            this.$nextTick(() => this.$refs.details.showModal());
        }
    },

    mounted() {
        try {
            const saved = JSON.parse(localStorage.getItem("frontmusic.favorites"));
            if (Array.isArray(saved)) {
                this.favorites = saved;
            }
        } catch {
            this.favoriteNote = "Favoritter kan bruges her, men gemmes ikke mellem besøg.";
        }
        this.searchAlbums();
    }
}).mount("#app");

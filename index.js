// Test kan vælge en lokal API-adresse. Hjemmesiden bruger ellers Azure.
const apiUrl = window.FRONTMUSIC_API_URL || "https://restmusicproject-g5aee9cthpghdcd9.swedencentral-01.azurewebsites.net/api/Collection";

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
            favoriteNote: "Favoritter gemmes i denne browser.",
            // Login gælder, indtil brugeren logger ud eller genindlæser siden.
            token: "",
            username: "",
            loginUsername: "",
            loginPassword: "",
            loginError: "",
            loggingIn: false,
            saving: false,
            formError: "",
            actionError: "",
            notice: "",
            editingAlbum: null,
            deletingAlbum: null,
            albumForm: { title: "", artist: "", duration: 180, publicationYear: new Date().getFullYear() }
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
                // Hvert nummer skal have sit eget positive id fra backend.
                const ids = response.data.map(album => album.id);
                if (!ids.every(id => Number.isInteger(id) && id > 0) || new Set(ids).size !== ids.length) {
                    throw new Error("API'et skal returnere unikke id'er til musiknumrene.");
                }
                this.albums = response.data;
                if (!this.title.trim() && !this.artist.trim()) {
                    this.allAlbums = response.data;
                    // Bevar favoritter fra den tidligere udgave, der brugte titel/kunstner.
                    this.favorites = this.favorites.map(key => {
                        const album = this.allAlbums.find(item => JSON.stringify([item.title, item.artist, item.publicationYear]) === key);
                        return album ? String(album.id) : key;
                    });
                    this.saveFavorites();
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
            // Samme nøgle bruges også efter ændring af titel eller kunstner.
            return String(album.id);
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
            this.saveFavorites();
        },
        saveFavorites() {
            try {
                localStorage.setItem("frontmusic.favorites", JSON.stringify(this.favorites));
            } catch {
                this.favoriteNote = "Browseren kunne ikke gemme favoritterne. De virker indtil siden lukkes.";
            }
        },
        openLogin() {
            this.loginError = "";
            this.loginPassword = "";
            this.$refs.loginDialog.showModal();
        },
        async login() {
            this.loggingIn = true;
            this.loginError = "";
            try {
                const response = await axios.post(apiUrl.replace("/Collection", "/Auth/login"), {
                    username: this.loginUsername,
                    password: this.loginPassword
                }, { timeout: 15000 });
                if (typeof response.data.token !== "string" || !response.data.token) {
                    throw new Error("Login returnerede ikke et token");
                }
                this.token = response.data.token;
                this.username = this.loginUsername;
                this.actionError = "";
                this.notice = "Du er logget ind.";
                this.$refs.loginDialog.close();
            } catch (error) {
                this.loginError = error.response?.status === 401
                    ? "Brugernavn eller adgangskode er forkert."
                    : "Vi kunne ikke logge dig ind lige nu. Prøv igen om lidt.";
            } finally {
                this.loggingIn = false;
                this.loginPassword = "";
            }
        },
        logout() {
            this.token = "";
            this.username = "";
            this.loginPassword = "";
            this.notice = "Du er logget ud.";
            this.actionError = "";
            this.$refs.albumDialog.close();
            this.$refs.deleteDialog.close();
        },
        openCreate() {
            if (!this.token) return;
            this.editingAlbum = null;
            this.formError = "";
            this.albumForm = { title: "", artist: "", duration: 180, publicationYear: new Date().getFullYear() };
            this.$refs.albumDialog.showModal();
        },
        openEdit(album) {
            if (!this.token) return;
            this.editingAlbum = album;
            this.formError = "";
            // En kopi gør, at Annuller ikke ændrer nummeret i listen.
            this.albumForm = { ...album };
            this.$refs.albumDialog.showModal();
        },
        openDelete(album) {
            if (!this.token) return;
            this.deletingAlbum = album;
            this.formError = "";
            this.$refs.deleteDialog.showModal();
        },
        albumUrl(album) {
            if (!Number.isInteger(album.id) || album.id <= 0) {
                throw new Error("Nummeret mangler et gyldigt id.");
            }
            return apiUrl + "/" + album.id;
        },
        requestOptions() {
            // Tokenet sendes med til backend, der kontrollerer login og rolle.
            return { headers: { Authorization: "Bearer " + this.token }, timeout: 15000 };
        },
        async saveAlbum() {
            if (!this.token || this.saving) return;
            this.formError = "";
            if (!this.albumForm.title.trim() || !this.albumForm.artist.trim()
                || !Number.isInteger(this.albumForm.duration) || this.albumForm.duration < 1
                || this.albumForm.duration > 2147483647
                || !Number.isInteger(this.albumForm.publicationYear)
                || this.albumForm.publicationYear < 1 || this.albumForm.publicationYear > 9999) {
                this.formError = "Udfyld titel og kunstner, en positiv varighed og et år fra 1 til 9999.";
                return;
            }
            this.saving = true;
            this.actionError = "";
            this.notice = "";
            try {
                // Id kommer fra backend og skal ikke udfyldes eller ændres i formularen.
                const album = {
                    title: this.albumForm.title.trim(),
                    artist: this.albumForm.artist.trim(),
                    duration: this.albumForm.duration,
                    publicationYear: this.albumForm.publicationYear
                };
                if (this.editingAlbum) {
                    await axios.put(this.albumUrl(this.editingAlbum), album, this.requestOptions());
                    // Favoritten beholder samme id, selv om oplysningerne ændres.
                    this.notice = "Nummeret er opdateret.";
                } else {
                    await axios.post(apiUrl, album, this.requestOptions());
                    this.notice = "Nummeret er tilføjet.";
                }
                this.$refs.albumDialog.close();
                await this.refreshCollection();
            } catch (error) {
                this.formError = this.handleActionError(error);
            } finally {
                this.saving = false;
            }
        },
        async deleteAlbum() {
            if (!this.token || !this.deletingAlbum || this.saving) return;
            this.saving = true;
            this.formError = "";
            this.actionError = "";
            this.notice = "";
            try {
                await axios.delete(this.albumUrl(this.deletingAlbum), this.requestOptions());
                const key = this.albumKey(this.deletingAlbum);
                this.favorites = this.favorites.filter(favorite => favorite !== key);
                this.saveFavorites();
                this.$refs.deleteDialog.close();
                this.notice = "Nummeret er slettet.";
                await this.refreshCollection();
            } catch (error) {
                this.formError = this.handleActionError(error);
            } finally {
                this.saving = false;
            }
        },
        async refreshCollection() {
            this.title = "";
            this.artist = "";
            this.showOnlyFavorites = false;
            await this.searchAlbums();
        },
        handleActionError(error) {
            const status = error.response?.status;
            if (status === 401) {
                this.logout();
                this.notice = "";
                this.actionError = "Dit login er udløbet. Log ind igen.";
                return this.actionError;
            }
            if (status === 403) return "Du har ikke adgang til denne handling.";
            if (status === 404) return "Nummeret findes ikke længere. Genindlæs samlingen.";
            if (status === 409) return "Et nummer med den titel og kunstner findes allerede.";
            if (status === 400) return "Kontrollér oplysningerne. Alle felter skal være udfyldt med gyldige værdier.";
            return "Handlingen kunne ikke gennemføres. Prøv igen om lidt.";
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

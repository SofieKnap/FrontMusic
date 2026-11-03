const apiUrl = "http://localhost:5145/api/Collection";

Vue.createApp({
    data() {
        return {
            albums: []
        };
    },

    async mounted() {
        try {
            const response = await axios.get(apiUrl);
            this.albums = response.data;
        } catch (error) {
            console.error("Kunne ikke hente musiksamlingen", error);
        }
    }
}).mount("#app");
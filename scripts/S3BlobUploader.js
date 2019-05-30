/*! Copyright Social CRM Hub, HEAT, and other contributors. Licensed under MIT *//*
    https://github.com/SCRMHub/AWS-S3-Multipart-JS-Uploader/LICENSE
*/
/**
 * S3BlobUploader Class
 * @author Gregory Brine <greg.brine@scrmhub.com>
 * @author Arthur Moore <arthur@heatrsd.com>
 */
(function(window, document, undefined) {
    class S3BlobUploader {
        /**
         * Our main class
         * @param {array} opts configuration override options for the class
         */
        constructor(opts) {
            /**
             * Supported by browser?
             * @type {boolean}
             */
            this.support = (
                typeof File !== 'undefined' &&
                typeof Blob !== 'undefined' &&
                typeof FileList !== 'undefined' &&
                (
                    !!Blob.prototype.slice || !!Blob.prototype.webkitSlice || !!Blob.prototype.mozSlice ||
                    false
                ) // slicing files support
            );

            if (!this.support) {
                return ;
            }

            /**
             * Check if directory upload is supported
             * @type {boolean}
             */
            this.supportDirectory = /Chrome/.test(window.navigator.userAgent);

            //Option things
            this.defaults = {
                debug         : false,
                partSize      : 5 * 1024 * 1024, //Base of 5mb
                type          : 'blob',
                simultaneous  : 4,
                server_url    : './server.php',
                method        : 'get'
            };

            /**
             * Current options
             * @type {Object}
             */
            this.opts = {};

            /**
             * List of events:
             *  key stands for event name
             *  value array list of callbacks
             * @type {}
             */
            this.events = {};

            /**
             * Holds the details of the last active item
             * Array
             */
            this.queue = {
                start   : false,
                blobs   : {},
                active  : 0,
                last    : 0,
                complete: 0,
                failed  : 0,
                failedChunk: []
            };

            this.numParts = 0;

            /**
             * Current options
             * @type {Object}
             */
            this.opts = S3BlobUploader.extend({}, this.defaults, opts || {});
        }

        /**
         * Internal logging based on if we're debugging or not
         **/
        log(args) {
            if(this.opts.debug) {
                window.console.log(args);
            }
        }

        /**
         * register a callback event
         * @param {string}    event
         * @param {Function}  callback
         */
        on(event, callback) {
            event = event.toLowerCase();
            if (!this.events.hasOwnProperty(event)) {
                this.events[event] = [];
            }
            this.events[event].push(callback);
                }

        /**
         * Remove a callback event
         * @param {string} [event] removes all events if not specified
         * @param {Function} [fn] removes all callbacks of event if not specified
         */
        off(event, fn) {
            if (event !== undefined) {
                event = event.toLowerCase();
                if (fn !== undefined) {
                    if (this.events.hasOwnProperty(event)) {
                        arrayRemove(this.events[event], fn);
                    }
                } else {
                    delete this.events[event];
                }
            } else {
                this.events = {};
            }
                }

        /**
         * Fire an event
         * @param {string} event event name
         * @param {...} args arguments of a callback
         * @return {bool} value is false if at least one of the event handlers which handled this event
         * returned false. Otherwise it returns true.
         */
        fire(event, args) {
            // `arguments` is an object, not array, in FF, so:
            args = Array.prototype.slice.call(arguments);
            event = event.toLowerCase();
            let preventDefault = false;
            if (this.events.hasOwnProperty(event)) {
                each(this.events[event], function (callback) {
                    preventDefault = callback.apply(this, args.slice(1)) === false || preventDefault;
                }, this);
            }
            if (event !== 'catchall') {
                args.unshift('catchAll');
                preventDefault = this.fire.apply(this, args) === false || preventDefault;
            }
            return !preventDefault;
                }

        /**
         * Update the amoun tthat's been uploaded
         * @param  {int} partNum        Which bit was uploaded
         * @param  {int} partProgress   How much of that part was uploaded (file size)
         * @param  {int} partPercentage What percentage of the part was uploaded
         */
        updatePartProgress(partNum, partProgress, partPercentage) {
            this.uploadedSize += partProgress;
            this.updateProgressBar();
        }

        /**
         * Update the progress bar
         * @return {array} some stuff about how we're tracking
         */
        updateProgressBar() {
            let surePercent    = this.sureUploadSize / this.totalSize;
            let percent        = this.uploadedSize / this.totalSize;

            if(percent > 0.9999) {
                percent = 1;
            }

            let progress = {
                total:          this.totalSize,
                uploaded:       this.uploadedSize,
                percent:        percent,
                sureUploaded:   this.sureUploadSize,
                surePercent:    surePercent,
                parts:          this.numParts,
                partsCompleted: this.queue.complete
            };

            this.fire('progressStats', progress);
            this.fire('progress', percent);
        }

        /**
         * We Finished. Hooray!
         * @return {event} The finishing event
         */
        completeMultipartUpload() {
            let thisClass = this;

            //So something failed so stop uploading
            if(this.queue.failed > 0) {
                return;
            }

            //queue is stopped
            if(!this.queue.start) {
                return;
            }

            //Fire the 'finishing' event
            thisClass.fire('finishing');

            //Trigger the final AWS Multipart file trigger
            $.ajax({
                url:    thisClass.opts.server_url,
                method: thisClass.opts.method,
                data: {
                    action:         'multipartComplete',
                    type:           thisClass.file.type,
                    requestType:    thisClass.opts.type,
                    sendBackData:   thisClass.sendBackData
                }
            }).done(function(data) {
                //And we're done
                thisClass.fire('complete', data);
            }).fail(function(evt) {
                thisClass.fire('error', evt);
            });
        }

        /**
         * Dispatch the next part of the upload
         * Spawns instances of the S3BlobChunk
         */
        queueDispatchNext() {
            //So something failed so stop uploading
            if(this.queue.failed > 0) {
                return;
            }

            //queue is stopped
            if(!this.queue.start) {
                return;
            }

            let dispatching = this.queue.last + 1;

            //No parts left
            if (dispatching > this.numParts) {
                //No active parts
                if(this.queue.active === 0) {
                    this.completeMultipartUpload();
                }

                return;
            }

            //Info on what's being uploaded
            let blob        = this.queue.blobs[dispatching];
            let curBlobPart = this.file.slice(blob.start, blob.end);

            //New Chunk objects
            let newChunk = new S3BlobChunk(this, dispatching, blob, curBlobPart);

            //Add the chunk for reference
            this.queue.blobs[dispatching].chunk = newChunk;
            this.queue.last = dispatching;

            //Up the count
            this.queue.active += 1;

            //start it
            newChunk.start();

            //Send another part if not completely active
            if(this.queue.active < this.opts.simultaneous) {
                this.queueDispatchNext();
            }
        }

        /**
         * Track the completiton of a chunk
         * @param  {[type]} partNum [description]
         * @param  {[type]} length  [description]
         * @param  {[type]} size    [description]
         * @return {[type]}         [description]
         */
        chunkComplete(partNum, length, size) {
            //reset values
            this.sureUploadSize    += length;

            //increment counters accordingly
            this.queue.active   -= 1;
            this.queue.complete += 1;

            //Trigger update progress (last chunk won't fire)
            this.updateProgressBar();

            //Send next part
            this.queueDispatchNext();
        }

        /**
         * Part failed after 3 goes
         * @param  {int} partNum    Which part failed
         * @param  {event} evt      What happened
         */
        chunkFailed(partNum, evt) {
            let currentCount = this.queue.failed;

            this.queue.start = false;
            this.queue.failed += 1;
            this.queue.failedChunk.push(partNum);

            //Don't bother if one already failed
            if(currentCount > 0) {
                return;
            }

            //store
            this.errorMessage = evt;

            //Fire an error event
            this.fire('error', {
                ok : false,
                result : {'partNum' : partNum},
                error : evt
            });

            //cancel all chunks
            this.cancelAllChunks();

            //Abort the upload on the server
            this.abortUpload();
        }

        //Cancel the upload
        abort() {
            this.queue.start = false;

            //Fire the event
            this.fire('cancel', {
                ok : false,
                result : {message: 'Upload was cancelled'},
            });

            //Cancel the uploads
            this.cancelAllChunks();

            //Abort the upload on the server
            this.abortUpload();
                }

        //Send the abort command to the server
        abortUpload() {
            let thisClass = this;
            //Abort it on the server
            $.ajax({
                url:    thisClass.opts.server_url,
                method: thisClass.opts.method,
                data: {
                    action:   'multipartAbort',
                    sendBackData: this.sendBackData
                },
                dataType: 'json'
            });
                }

        //Cancel any active chunks
        cancelAllChunks() {
            //Loop through all blobs and stop them
            for(let i in this.queue.blobs) {
                let thisClass = this.queue.blobs[i];

                if(thisClass.chunk) {
                    thisClass.chunk.abort();
                }
            }
        }

        /**
         * Prepares the details of each chunk for the queue
         * @param  {[type]} partNum [description]
         * @param lastPart
         * @return {[type]}         [description]
         */
        preparePart(partNum, lastPart) {
            let start = (partNum - 1) * this.opts.partSize;
            let end = 0;
            //Last chunk always ends with the file size
            if (lastPart) {
                end = this.totalSize;
            } else {
                end = start + this.opts.partSize;
            }

            //How much is going up this time
            let length = end - start;

            //Add it to the queus
            this.queue.blobs[partNum] = {
                start   : start,
                end     : end,
                length  : length,
                last    : lastPart
            }
        }

        /**
         * Setup the partions
         * @param  {[type]} data [description]
         * @return {[type]}      [description]
         */
        startPartitioning(data) {
            this.sendBackData = data;
            this.updateProgressBar();

            let totalParts = this.totalSize / this.opts.partSize;
            let totalFloor   = Math.floor(totalParts);

            //Make sure it's never zero parts
            if(totalFloor <= 0) {
                this.numParts = 1;

                //If the last chunk is small, add it to the last big chunk instead
            } else if((totalParts - totalFloor) < 0.2) {
                this.numParts = totalFloor;

                //Else round it up
            } else {
                this.numParts   = Math.ceil(totalParts);

            }

            for (let i = 1; i <= this.numParts; i++) {
                this.preparePart(i, (i === this.numParts));
            }

            this.queueDispatchNext();
        }

        /**
         * Upload a file
         * @param  {File} fileToUpload
         * @return {[type]}              [description]
         */
        start(fileToUpload) {
            // Check for the various File API support.
            if (window.File && window.FileReader && window.FileList && window.Blob && window.Blob.prototype.slice) {
                //Set everything nicely
                this.sendBackData           = {};
                this.progress               = {}; //progress of each blob
                this.uploadedSize           = 0;
                this.sureUploadSize         = 0;

                let file = this.file    = fileToUpload;

                this.totalSize          = file.size;

                //Get back to "this"
                let thisClass = this;

                //Pre run
                this.fire('beforeUpload');

                $.ajax({
                    url:    thisClass.opts.server_url,
                    method: thisClass.opts.method,
                    data: {
                        action:   'multipartStart',
                        fileInfo: {
                            name: file.name,
                            type: file.type,
                            size: file.size,
                            lastModifiedDate: file.lastModifiedDate
                        }
                    },
                    dataType: 'json'
                }).done(function(data) {
                    if(data.ok) {
                        //Start the upload
                        thisClass.queue.start = true;

                        //Got a response and starting
                        thisClass.fire('startUpload');

                        //Build partions
                        thisClass.startPartitioning(data.result);
                    }
                }).fail(function(evt) {
                    thisClass.startFail(evt);
                });
            } else {
                alert('The File APIs are not fully supported in this browser.');
            }
        }

        startFail(evt) {
            this.queue.start = false;

            this.fire('error', {
                ok : false,
                result : {message : 'Couldn\'t start the upload'},
                error : evt
            });
        }
    }


    class S3BlobChunk {
        /**
         * A part of a file
         * @param {S3BlobUploader} uploader
         * @param {number} partNum
         * @param blob
         * @param {Blob} chunk The current part of the blob that's being sent
         */
        constructor(uploader, partNum, blob, chunk) {
            this.uploader   = uploader;
            this.chunk      = chunk;
            this.partNum    = partNum;
            this.length     = chunk.size;
            this.probableUploadSize = 0;
            this.tries = 0;
            this.errorMessage = [];
            this.request = false;
            this.maxTries = 3;
            this.aborted = false;
            this.hash = '';
            this.useSha256 = true;
        }

        start() {
            if(!this.useSha256) {
                this.hash = 'UNSIGNED-PAYLOAD';
                this.signChunk();
                return
            }
            let thisClass = this;
            let reader = new FileReader();
            reader.onload = function (f) {
                crypto.subtle.digest("SHA-256", f.target.result)
                    .then(function(result){
                        thisClass.hash = hexString(result);
                        // console.log(thisClass.hash);
                        thisClass.signChunk();
                    });
            };
            reader.readAsArrayBuffer(this.chunk);
        }

        signChunk() {
            //Upload was cancelled
            if(this.aborted) {
                return;
            }

            let thisClass = this;

            $.ajax({
                  url:    thisClass.uploader.opts.server_url,
                  method: thisClass.uploader.opts.method,
                  data: {
                      action:        'multipartSignPart',
                      partNumber:     this.partNum,
                      contentLength:  this.length,
                      ContentSHA256:  this.hash,
                      sendBackData:   this.uploader.sendBackData
                  },
                  dataType: 'json'
              }).done(function(data) {
                  thisClass.url         = data.result.url;
                  thisClass.authHeader  = data.result.authHeader;
                  thisClass.dateHeader  = data.result.dateHeader;
                  thisClass.uploadChunk();
              }).fail(function(evt) {
                thisClass.onFail(evt);
              });
        }

        uploadChunk() {
            //Upload was cancelled
            if(this.aborted) {
                return;
            }

            let thisClass   = this;
            let request     = new XMLHttpRequest();

            request.open('PUT', thisClass.url, true);
            request.contentLength = thisClass.length;

            request.onreadystatechange = function() {
                if (request.readyState === 4 && request.status === 200) {
                    //Done with a chunk
                    thisClass.onDone(request.contentLength);
                }
            };
            request.upload.onprogress = function(e) {
                if (e.lengthComputable) {
                    // console.log(e.loaded, e.loaded / thisClass.chunk.size);
                    //thisClass.uploader.progress[thisClass.partNum]  = e.loaded / thisClass.chunk.size;
                    thisClass.updatePartProgress(e.loaded);
                    //thisClass.uploader.updateProgressBar();
                }
            };
            request.upload.addEventListener("error", function(evt) {
                thisClass.onFail(evt);
            });
            request.setRequestHeader("X-Amz-Date", thisClass.dateHeader);
            request.setRequestHeader("X-Amz-Content-Sha256", thisClass.hash);
            request.setRequestHeader("Authorization",   thisClass.authHeader);
            //request.setRequestHeader("Content-Length",  thisClass.length);

            //Flag for stopping
            thisClass.request = request;

            //Start
            request.send(thisClass.chunk);
        }

        updatePartProgress(loaded) {
            //Work out how much went up this time
            let loadedSize = loaded - this.probableUploadSize;

            //Save it for next update
            this.probableUploadSize = loaded;

            //chunk Percentage
            let progressPercent = this.chunk.size / loaded;

            //Tell the parent about how far we got
            this.uploader.updatePartProgress(this.partNum, loadedSize, progressPercent);
        }

        onDone(length) {
            //start the next chunk
            this.uploader.chunkComplete(this.partNum, length, this.chunk.size);
        }

        onFail(evt) {
            //store the message
            this.errorMessage = evt;

            //increment the counter
            this.tries += 1;

            //3 fails :(
            if(this.tries >= this.maxTries) {
                this.uploader.chunkFailed(this.partNum, evt);

                //try again
            } else {
                this.start();
            }
        }

        abort() {
            this.aborted = true;
            if(this.request) {
                this.request.abort();
            }

            this.request = false;
        }

        //stop the whole process
        onUploaderFail() {
            this.tries = 3;

            this.abort();
        }
    }

    /**
    * Remove value from array
    * @param array
    * @param value
    */
    function arrayRemove(array, value) {
        let index = array.indexOf(value);
        if (index > -1) {
            array.splice(index, 1);
        }
    }

    /**
    * If option is a function, evaluate it with given params
    * @param {*} data
    * @param {...} args arguments of a callback
    * @returns {*}
    */
    function evalOpts(data, args) {
        if (typeof data === "function") {
            // `arguments` is an object, not array, in FF, so:
            args = Array.prototype.slice.call(arguments);
            data = data.apply(null, args.slice(1));
        }
        return data;
    }

    /**
    * Execute function asynchronously
    * @param fn
    * @param context
    */
    function async(fn, context) {
        setTimeout(fn.bind(context), 0);
    }

    /**
    * Extends the destination object `dst` by copying all of the properties from
    * the `src` object(s) to `dst`. You can specify multiple `src` objects.
    * @function
    * @param {Object} dst Destination object.
    * @param {...Object} src Source object(s).
    * @returns {Object} Reference to `dst`.
    */
    function extend(dst, src) {
        each(arguments, function(obj) {
            if (obj !== dst) {
                each(obj, function(value, key){
                    dst[key] = value;
                });
            }
        });
        return dst;
    }

    /**
    * Iterate each element of an object
    * @function
    * @param {Array|Object} obj object or an array to iterate
    * @param {Function} callback first argument is a value and second is a key.
    * @param {Object=} context Object to become context (`this`) for the iterator function.
    */
    function each(obj, callback, context) {
        if (!obj) {
            return ;
        }
        let key;
        // Is Array?
        if (typeof(obj.length) !== 'undefined') {
          for (key = 0; key < obj.length; key++) {
            if (callback.call(context, obj[key], key) === false) {
              return ;
            }
          }
        } else {
          for (key in obj) {
            if (obj.hasOwnProperty(key) && callback.call(context, obj[key], key) === false) {
              return ;
            }
          }
        }
    }

    /**
     * Convert an ArrayBuffer into a hex string.
     * From https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/digest
     * Used to create a sha-256 hash of the data without relying on external libraries
     */
    function hexString(buffer) {
        const byteArray = new Uint8Array(buffer);

        const hexCodes = [...byteArray].map(value => {
            const hexCode = value.toString(16);
            return hexCode.padStart(2, '0');
        });

        return hexCodes.join('');
    }

    S3BlobUploader.evalOpts = evalOpts;
    S3BlobUploader.extend = extend;
    S3BlobUploader.each = each;

    if ( typeof module === "object" && module && typeof module.exports === "object" ) {
        // Expose as module.exports in loaders that implement the Node
        // module pattern (including browserify). Do not create the global, since
        // the user will be storing it themselves locally, and globals are frowned
        // upon in the Node module world.
        module.exports = S3BlobUploader;
    } else {
        // Otherwise expose to the global object as usual
        window.S3BlobUploader = S3BlobUploader;
    }    
})(window, document);

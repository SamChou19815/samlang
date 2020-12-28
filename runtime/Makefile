# Boehm-Demers-Weiser collector
GCLIBDIR = gc-8.0.4
GCLIBZIP = gc-8.0.4.tar.gz
GCLIB = $(GCLIBDIR)/.libs/libgc.a

# libatomic_ops (dependency of Boehm GC)
LIBATOMIC = libatomic_ops-7.6.2
LIBATOMICZIP = $(LIBATOMIC).tar.gz

all: libsam.a

llvm: $(GCLIB) libsam/libsam.bc
	rm -f $@
	cp $(GCLIB) $@

libsam.a: $(GCLIB) libsam/libsam.o
	rm -f $@
	cp $(GCLIB) $@
	ar rcs $@ libsam/libsam.o

%.o: %.c
	gcc -g -Wall -O2 -m64 -c -o $@ $<

%.bc: %.c
	clang -O3 -emit-llvm $< -c -o $@

$(GCLIB): $(GCLIBDIR)/configure
	cd $(GCLIBDIR); ./configure --enable-static=yes --enable-shared=no; make

$(GCLIBDIR)/configure:
	# extract and install dependencies
	rm -f $(GCLIB)
	rm -rf $(GCLIBDIR)
	tar -xzvf deps/$(GCLIBZIP)
	tar -xzvf deps/$(LIBATOMICZIP)
	mv $(LIBATOMIC) $(GCLIBDIR)/libatomic_ops
	if [ -f ../gcconfig.h ] ; \
	then cp ../gcconfig.h $(GCLIBDIR)/include/private/ ; \
	fi;

clean:
	rm -f libsam.a
	rm -f libsam/libsam.o
	rm -f *~

clobber: clean
	$(MAKE) -C $(GCLIBDIR) clean
	cp ../gcconfig.h $(GCLIBDIR)/include/private/

dust: clobber
	rm -f $(GCLIBZIP)
	rm -rf $(GCLIBDIR)
